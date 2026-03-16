import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AyurvedaDataService, ConsultationContextRecord } from '../../services/ayurveda-data.service';
import { ConsultationMode, ConsultationRecord, DoctorProfile } from '../../models/ayurveda.models';
import { ConsultationBookingService, DoctorPatientBrief } from '../../services/consultation-booking.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { buildApiUrl } from '../../core/config/runtime-config';

@Component({
  selector: 'app-consult-room',
  templateUrl: './consult-room.component.html',
  styleUrls: ['./consult-room.component.scss']
})
export class ConsultRoomComponent implements OnInit, OnDestroy {
  @ViewChild('localVideo') localVideoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('chatScroll') chatScrollRef?: ElementRef<HTMLDivElement>;

  consultation: ConsultationRecord | null = null;
  doctor: DoctorProfile | null = null;
  context: ConsultationContextRecord | null = null;
  patientBrief: DoctorPatientBrief | null = null;
  message = '';
  loading = true;
  error = '';
  sessionStatus = '';
  isMuted = false;
  isCameraOn = true;
  disconnected = false;
  realtimeSessionId = '';
  realtimeConnected = false;
  serverError = '';
  mediaError = '';
  
  // Call State
  incomingCall: { from: string, type: 'audio' | 'video' } | null = null;
  outgoingCall: 'audio' | 'video' | null = null;
  activeCall: 'audio' | 'video' | null = null;
  
  private readonly realtimeServerBase = buildApiUrl('');
  private channel: any = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private readonly rtcConfig: RTCConfiguration = {
    iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }]
  };

  private heartbeatRef: ReturnType<typeof setInterval> | null = null;
  private onlineHandler = () => this.handleOnline();
  private offlineHandler = () => this.handleOffline();
  private doctorLateNotified = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService,
    private ayurvedaData: AyurvedaDataService,
    private bookingService: ConsultationBookingService,
    private supabaseService: SupabaseService
  ) {}

  ngOnInit(): void {
    const user = this.auth.getCurrentUser();
    if (!user) {
      this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl: this.router.url || '/consult' } });
      return;
    }

    const sessionId = this.route.snapshot.paramMap.get('sessionId');
    const doctorId = this.route.snapshot.paramMap.get('doctorId');

    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);

    if (sessionId) {
      this.loadExistingSession(sessionId);
      return;
    }

    if (doctorId && user.role === 'patient') {
      this.startSessionWithDoctor(doctorId);
      return;
    }

    this.error = 'Consultation session was not found.';
    this.loading = false;
  }

  ngOnDestroy(): void {
    if (this.heartbeatRef) clearInterval(this.heartbeatRef);
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
    this.cleanupRealtime();
  }

  async switchMode(mode: ConsultationMode): Promise<void> {
    if (!this.consultation) return;
    this.mediaError = '';
    this.serverError = '';
    if (this.consultation.status !== 'active') {
      this.sessionStatus = 'Session is completed. Chat history is now read-only.';
      return;
    }
    if ((mode === 'audio' || mode === 'video') && !navigator.onLine) {
      this.fallbackToChat('Network unavailable. Falling back to chat.');
      return;
    }

    if (mode === 'chat') {
      this.ensureRealtimeChannel();
      this.syncConsultationMode('chat');
      return;
    }

    await this.requestCall(mode);
  }

  private syncConsultationMode(mode: ConsultationMode): void {
    if (!this.consultation) return;
    const updated = this.ayurvedaData.switchConsultationMode(this.consultation.id, mode);
    if (updated) {
      this.consultation = updated;
      if (this.channel) {
        this.channel.send({
          type: 'broadcast',
          event: 'session-mode',
          payload: { mode }
        });
      }
    }
  }

  sendMessage(): void {
    const text = this.message.trim();
    const user = this.auth.getCurrentUser();
    if (!text || !this.consultation || !user) return;
    if (this.consultation.status !== 'active') {
      this.sessionStatus = 'This consultation has ended. New messages are disabled.';
      return;
    }
    if (!this.channel) {
      this.serverError = 'Realtime chat is not connected. Click Chat mode first.';
      return;
    }
    
    this.channel.send({
      type: 'broadcast',
      event: 'chat-message',
      payload: { 
        id: `msg_${Date.now()}`,
        sender: user.role,
        text,
        createdAt: new Date().toISOString()
      }
    });
    this.message = '';
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.chatScrollRef?.nativeElement) {
        this.chatScrollRef.nativeElement.scrollTop = this.chatScrollRef.nativeElement.scrollHeight;
      }
    }, 50);
  }

  addFileMock(): void {
    if (!this.consultation) return;
    if (this.consultation.status !== 'active') {
      this.sessionStatus = 'Session completed. File sharing is disabled.';
      return;
    }
    if (!this.channel) {
      this.serverError = 'Connect to chat before sharing files.';
      return;
    }
    this.fileInputRef?.nativeElement.click();
  }

  endActiveCall(): void {
    this.closePeerConnectionOnly();
    this.activeCall = null;
    this.outgoingCall = null;
    this.incomingCall = null;
    this.syncConsultationMode('chat');
    this.sessionStatus = 'Call ended.';
  }

  async endConsultation(): Promise<void> {
    if (!this.consultation) return;
    const user = this.auth.getCurrentUser();
    if (!user) return;
    if (user.role === 'patient') {
      const confirmed = window.confirm('End consultation now? Chat and records will become read-only.');
      if (!confirmed) return;
    }
    this.endActiveCall();
    const ended = this.ayurvedaData.closeConsultation(this.consultation.id, user.role === 'doctor' ? 'doctor' : 'patient');
    if (ended) {
      this.consultation = ended;
      this.sessionStatus = 'Consultation ended safely. Records are preserved.';
    }
    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'session-ended',
        payload: { userId: user.id }
      });
    }
    this.cleanupRealtime();
  }

  createPrescription(): void {
    if (!this.consultation) return;
    const user = this.auth.getCurrentUser();
    if (!user || user.role !== 'doctor') {
      this.sessionStatus = 'Only doctor can proceed to prescription workflow.';
      return;
    }
    if (this.consultation.status === 'active') {
      const closed = this.ayurvedaData.closeConsultation(this.consultation.id, 'doctor', 'Consultation closed for prescription.');
      if (closed) this.consultation = closed;
    }
    this.router.navigate(['/doctor/prescription/create', this.consultation.sessionId || this.consultation.id]);
  }

  toggleMute(): void {
    if (!this.localStream) {
      this.mediaError = 'Audio stream not active. Start Audio or Video first.';
      return;
    }
    const audioTracks = this.localStream.getAudioTracks();
    if (audioTracks.length === 0) {
      this.mediaError = 'Microphone track not found.';
      return;
    }
    this.isMuted = !this.isMuted;
    audioTracks.forEach((t) => (t.enabled = !this.isMuted));
  }

  toggleCamera(): void {
    if (!this.localStream) {
      this.mediaError = 'Video stream not active. Start Video first.';
      return;
    }
    const videoTracks = this.localStream.getVideoTracks();
    if (videoTracks.length === 0) {
      this.mediaError = 'Camera track not found.';
      return;
    }
    this.isCameraOn = !this.isCameraOn;
    videoTracks.forEach((t) => (t.enabled = this.isCameraOn));
  }

  get canSend(): boolean {
    return !!this.consultation && this.consultation.status === 'active';
  }

  get isDoctorView(): boolean {
    return this.auth.getCurrentUser()?.role === 'doctor';
  }

  get mediaUnavailableReason(): string {
    if (!window.isSecureContext && location.hostname !== 'localhost') {
      return 'Audio/Video requires HTTPS (or localhost) to access camera and microphone.';
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return 'This browser does not support media capture.';
    }
    return '';
  }

  get canStartAudio(): boolean {
    return !!this.consultation && this.consultation.status === 'active' && !this.mediaUnavailableReason;
  }

  get canStartVideo(): boolean {
    return !!this.consultation && this.consultation.status === 'active' && !this.mediaUnavailableReason;
  }

  private startSessionWithDoctor(doctorId: string): void {
    const user = this.auth.getCurrentUser();
    if (!user) return;
    this.doctor = this.ayurvedaData.getDoctorById(doctorId) || null;
    if (!this.doctor || !this.doctor.verified) {
      this.error = 'Verified doctor not found for consultation.';
      this.loading = false;
      return;
    }
    const latestAssessment = this.auth.getLatestDoshaAssessment(user.id);
    const bookingId = this.route.snapshot.queryParamMap.get('bookingId');
    
    try {
      const record = this.ayurvedaData.startConsultation({
        patientId: user.id,
        doctorId,
        linkedAssessmentId: bookingId || latestAssessment?.id,
        initiationType: bookingId ? 'appointment' : 'instant'
      });
      this.ayurvedaData.createNotification(
        user.id,
        'appointment',
        'Consultation started',
        `Consultation with ${this.doctor.fullName} started in chat mode.`,
        ['inApp', 'email']
      );
      this.router.navigate(['/consult/session', record.sessionId || record.id], { replaceUrl: true });
    } catch (err: any) {
      this.error = err?.message || 'Unable to start consultation.';
      this.loading = false;
    }
  }

  private async loadExistingSession(sessionId: string): Promise<void> {
    const user = this.auth.getCurrentUser();
    if (!user) return;
    
    try {
      const response = await fetch(
        `${buildApiUrl(`/api/sessions/${encodeURIComponent(sessionId)}`)}?userId=${encodeURIComponent(user.id)}`
      );
      if (response.ok) {
        const serverSession = await response.json();
        const localConsult = this.ayurvedaData.getConsultationBySessionId(sessionId);
        
        if (!localConsult) {
           this.consultation = this.ayurvedaData.startConsultation({
               patientId: serverSession.patientId,
               doctorId: serverSession.doctorId,
               initiationType: serverSession.initiationType || 'instant'
           });
           if (this.consultation) {
               this.consultation.sessionId = sessionId;
               this.consultation.id = sessionId;
               (this.ayurvedaData as any).persistConsultations();
           }
        } else {
           this.consultation = localConsult;
        }
      } else {
         const access = this.ayurvedaData.canAccessConsultation(sessionId, user);
         if (!access.allowed) {
           this.error = access.reason || 'Access denied for this session.';
           this.loading = false;
           return;
         }
         this.consultation = this.ayurvedaData.getConsultationBySessionId(sessionId) || null;
      }
    } catch (e) {
       this.consultation = this.ayurvedaData.getConsultationBySessionId(sessionId) || null;
    }

    if (!this.consultation) {
      this.error = 'Consultation session not found.';
      this.loading = false;
      return;
    }

    this.doctor = this.ayurvedaData.getDoctorById(this.consultation.doctorId) || null;
    if (!this.doctor) {
      this.error = 'Assigned doctor record not found.';
      this.loading = false;
      return;
    }
    
    this.consultation = this.ayurvedaData.markParticipantJoined(this.consultation.id, user.role) || this.consultation;
    if (user.role === 'doctor') {
      this.context = this.ayurvedaData.getDoctorConsultationContext(this.consultation.id, user.id);
      void this.loadDoctorPatientBrief();
    }
    
    this.loading = false;
    this.startSessionMonitoring();
    this.realtimeSessionId = sessionId;
    this.ensureRealtimeChannel();
  }

  private startSessionMonitoring(): void {
    if (this.heartbeatRef) clearInterval(this.heartbeatRef);
    this.heartbeatRef = setInterval(() => {
      if (!this.consultation) return;
      const beat = this.ayurvedaData.heartbeatConsultation(this.consultation.id);
      if (beat) this.consultation = beat;
      if (this.channel) {
        this.channel.send({ type: 'broadcast', event: 'heartbeat', payload: {} });
      }
      this.handleDoctorLate();
    }, 15000);
  }

  private async loadDoctorPatientBrief(): Promise<void> {
    const user = this.auth.getCurrentUser();
    if (!user || user.role !== 'doctor' || !this.consultation) return;
    try {
      this.patientBrief = await this.bookingService.getDoctorPatientBrief(this.consultation.patientId, this.consultation.doctorId);
    } catch (err: any) {
      this.serverError = err?.error?.error || 'Patient pre-consult history is unavailable right now.';
      this.patientBrief = null;
    }
  }

  private handleDoctorLate(): void {
    if (!this.consultation || this.doctorLateNotified) return;
    const user = this.auth.getCurrentUser();
    if (!user || user.role !== 'patient') return;
    const joined = this.consultation.participantsJoined?.doctor;
    if (joined) return;
    const elapsedMs = Date.now() - new Date(this.consultation.startedAt).getTime();
    if (elapsedMs < 10 * 60 * 1000) return;
    this.doctorLateNotified = true;
    this.sessionStatus = 'Doctor is running late. You can continue by chat; doctor has been notified.';
    this.ayurvedaData.createNotification(
      user.id,
      'appointment',
      'Doctor running late',
      'Doctor has not joined yet. You can continue with chat and wait safely.',
      ['inApp']
    );
  }

  private refreshConsultation(): void {
    if (!this.consultation) return;
    const updated = this.ayurvedaData.getConsultationById(this.consultation.id);
    if (updated) this.consultation = updated;
  }

  private fallbackToChat(reason: string): void {
    if (!this.consultation) return;
    this.closePeerConnectionOnly();
    this.activeCall = null;
    this.outgoingCall = null;
    this.incomingCall = null;
    const updated = this.ayurvedaData.reportNetworkIssue(this.consultation.id);
    if (updated) this.consultation = updated;
    this.syncConsultationMode('chat');
    this.sessionStatus = reason;
  }

  private handleOnline(): void {
    this.disconnected = false;
    this.sessionStatus = 'Connection restored.';
  }

  private handleOffline(): void {
    this.disconnected = true;
    this.fallbackToChat('Network interruption detected. Session switched to chat.');
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length ? input.files[0] : null;
    if (!file || !this.consultation) return;

    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      this.serverError = `Unsupported file type: ${file.type}`;
      input.value = '';
      return;
    }

    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'file-share',
        payload: {
          id: `file_${Date.now()}`,
          name: file.name,
          mimeType: file.type,
          sizeKb: Math.round(file.size / 1024),
          uploadedBy: this.auth.getCurrentUser()?.role || 'user',
          uploadedAt: new Date().toISOString()
        }
      });
    }
    input.value = '';
  }

  private async initializeRealtimeSession(): Promise<void> {
    if (!this.consultation) return;
    const user = this.auth.getCurrentUser();
    if (!user) return;

    try {
      const response = await fetch(buildApiUrl('/api/sessions/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: this.consultation.patientId,
          doctorId: this.consultation.doctorId,
          requesterId: user.id,
          requesterRole: user.role,
          initiationType: this.consultation.initiationType || 'instant',
          linkedAssessmentId: this.consultation.linkedAssessmentId || ''
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to create realtime consultation session.');
      }
      this.realtimeSessionId = data.sessionId;
      this.sessionStatus = `Realtime session ready: ${data.sessionId}`;
    } catch (e: any) {
      this.serverError =
        `Realtime server unavailable on ${this.realtimeServerBase}. Start it with "npm run server". ` +
        `Details: ${e?.message || 'Unknown error'}`;
    }
  }

  private ensureRealtimeChannel(): void {
    if (this.channel) return;
    const user = this.auth.getCurrentUser();
    if (!user || !this.realtimeSessionId) return;

    this.channel = this.supabaseService.client
      .channel(`consultation_${this.realtimeSessionId}`)
      .on('broadcast', { event: 'chat-message' }, (payload: any) => {
        const msg = payload.payload;
        if (!this.consultation) return;
        const exists = this.consultation.messages.some((m) => m.id === msg.id);
        if (exists) return;
        this.consultation.messages.push(msg);
        this.consultation.messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        this.scrollToBottom();
      })
      .on('broadcast', { event: 'file-share' }, (payload: any) => {
        const file = payload.payload;
        if (!this.consultation) return;
        const exists = this.consultation.files.some((f) => f.id === file.id);
        if (exists) return;
        this.consultation.files.push({
          id: file.id,
          name: file.name,
          sizeKb: file.sizeKb,
          mimeType: file.mimeType,
          uploadedBy: file.uploadedBy,
          uploadedAt: file.uploadedAt,
          type: file.mimeType === 'application/pdf' ? 'report' : 'image'
        });
      })
      .on('broadcast', { event: 'session-state' }, (payload: any) => {
        const update = payload.payload;
        if (!this.consultation) return;
        this.consultation.status = update.status || this.consultation.status;
        this.consultation.activeMode = update.activeMode || this.consultation.activeMode;
        this.consultation.endTime = update.endedAt || this.consultation.endTime;
      })
      .on('broadcast', { event: 'session-mode' }, (payload: any) => {
        if (!this.consultation) return;
        this.consultation.activeMode = payload.payload.mode;
      })
      .on('broadcast', { event: 'session-ended' }, () => {
        this.sessionStatus = 'Session ended by participant.';
        this.cleanupRealtime();
        this.refreshConsultation();
      })
      .on('broadcast', { event: 'call-request' }, (payload: any) => {
        const evt = payload.payload;
        if (this.activeCall || this.outgoingCall) {
          this.channel.send({ type: 'broadcast', event: 'call-reject', payload: { reason: 'busy' } });
          return;
        }
        this.incomingCall = { from: evt.from, type: evt.callType };
        this.ayurvedaData.createNotification(
          user.id,
          'general',
          'Incoming Call',
          `Incoming ${evt.callType} call from ${evt.from}`,
          ['inApp']
        );
      })
      .on('broadcast', { event: 'call-accept' }, async (payload: any) => {
        const evt = payload.payload;
        if (this.outgoingCall === evt.callType) {
          this.activeCall = this.outgoingCall;
          this.outgoingCall = null;
          if (this.activeCall === 'audio' || this.activeCall === 'video') {
             await this.startRealtimeCall(this.activeCall);
          }
        }
      })
      .on('broadcast', { event: 'call-reject' }, () => {
        this.outgoingCall = null;
        this.sessionStatus = 'Call was rejected or peer is busy.';
        this.toastError('Call was rejected.');
      })
      .on('broadcast', { event: 'webrtc-offer' }, async (payload: any) => {
        try {
          await this.handleIncomingOffer(payload.payload.offer, payload.payload.callType);
        } catch (e: any) {
          this.mediaError = `Could not handle incoming offer: ${e?.message || e}`;
        }
      })
      .on('broadcast', { event: 'webrtc-answer' }, async (payload: any) => {
        try {
          if (!this.peerConnection || !payload.payload.answer) return;
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.payload.answer));
        } catch (e: any) {
          this.mediaError = `Could not apply remote answer: ${e?.message || e}`;
        }
      })
      .on('broadcast', { event: 'webrtc-ice' }, async (payload: any) => {
        try {
          if (!this.peerConnection || !payload.payload.candidate) return;
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(payload.payload.candidate));
        } catch (e: any) {
          this.mediaError = `Could not add ICE candidate: ${e?.message || e}`;
        }
      })
      .on('broadcast', { event: 'peer-disconnected' }, () => {
        this.fallbackToChat('Peer disconnected. Continuing with chat.');
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.realtimeConnected = true;
          this.serverError = '';
          this.sessionStatus = 'Realtime chat connected.';
          // Optionally send a join-room event if needed for initial state sync
          this.channel?.send({
            type: 'broadcast',
            event: 'join-room',
            payload: {
              sessionId: this.realtimeSessionId,
              userId: user.id,
              role: user.role
            }
          });
        } else if (status === 'CHANNEL_ERROR') {
          this.realtimeConnected = false;
          this.serverError = `Realtime connection failed: Channel error.`;
        } else if (status === 'TIMED_OUT') {
          this.realtimeConnected = false;
          this.serverError = `Realtime connection failed: Timed out.`;
        }
      });
  }

  private async requestCall(mode: 'audio' | 'video'): Promise<void> {
    if (this.mediaUnavailableReason) {
      this.mediaError = this.mediaUnavailableReason;
      return;
    }
    this.ensureRealtimeChannel();
    if (!this.realtimeConnected) {
      this.serverError = 'Cannot call right now. Realtime not connected.';
      return;
    }
    const user = this.auth.getCurrentUser();
    this.outgoingCall = mode;
    this.sessionStatus = `Ringing... waiting for accept.`;
    this.channel.send({ type: 'broadcast', event: 'call-request', payload: { callType: mode, from: user?.fullName } });
  }

  async acceptCall(): Promise<void> {
    if (!this.incomingCall || !this.channel) return;
    const mode = this.incomingCall.type;
    this.incomingCall = null;
    this.activeCall = mode;
    this.channel.send({ type: 'broadcast', event: 'call-accept', payload: { callType: mode } });
    this.sessionStatus = `Connecting ${mode} call...`;
    // We wait for the webrtc-offer from the caller to attach our stream via handleIncomingOffer
  }

  rejectCall(): void {
    if (!this.incomingCall || !this.channel) return;
    this.channel.send({ type: 'broadcast', event: 'call-reject', payload: { callType: this.incomingCall.type } });
    this.incomingCall = null;
  }

  private toastError(msg: string) {
    this.mediaError = msg;
    setTimeout(() => this.mediaError = '', 8000);
  }

  private async startRealtimeCall(mode: 'audio' | 'video'): Promise<void> {
    if (!this.consultation) return;
    if (this.mediaUnavailableReason) {
      this.mediaError = this.mediaUnavailableReason;
      return;
    }

    this.ensureRealtimeChannel();
    if (!this.realtimeConnected) {
      this.serverError = 'Cannot start call because realtime channel is not connected.';
      return;
    }

    try {
      const constraints: MediaStreamConstraints =
        mode === 'video' ? { audio: true, video: true } : { audio: true, video: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localStream = stream;
      this.attachLocalStream(stream);
      this.isMuted = false;
      this.isCameraOn = mode === 'video';
      this.mediaError = '';

      await this.ensurePeerConnection();
      this.attachTracksToPeer(stream);
      this.syncConsultationMode(mode);

      const offer = await this.peerConnection!.createOffer();
      await this.peerConnection!.setLocalDescription(offer);
      this.channel.send({ type: 'broadcast', event: 'webrtc-offer', payload: { offer, callType: mode } });
      this.sessionStatus = `${mode.toUpperCase()} call connected.`;
    } catch (e: any) {
      this.mediaError = this.mapMediaError(e);
      this.fallbackToChat('Call setup failed. Falling back to chat.');
    }
  }

  private async handleIncomingOffer(offer: RTCSessionDescriptionInit, callType: 'audio' | 'video'): Promise<void> {
    if (this.mediaUnavailableReason) throw new Error(this.mediaUnavailableReason);
    this.ensureRealtimeChannel();
    if (!this.realtimeConnected) throw new Error('Realtime channel disconnected.');

    if (!this.localStream) {
      const constraints: MediaStreamConstraints =
        callType === 'video' ? { audio: true, video: true } : { audio: true, video: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localStream = stream;
      this.attachLocalStream(stream);
      this.isCameraOn = callType === 'video';
    }

    await this.ensurePeerConnection();
    this.attachTracksToPeer(this.localStream!);

    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);
    this.channel.send({ type: 'broadcast', event: 'webrtc-answer', payload: { answer, callType } });
    this.syncConsultationMode(callType);
    this.sessionStatus = `${callType.toUpperCase()} call connected.`;
  }

  private async ensurePeerConnection(): Promise<void> {
    if (this.peerConnection) return;
    this.peerConnection = new RTCPeerConnection(this.rtcConfig);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.channel) {
        this.channel.send({ type: 'broadcast', event: 'webrtc-ice', payload: { candidate: event.candidate } });
      }
    };

    this.peerConnection.ontrack = (event) => {
      if (!this.remoteStream) this.remoteStream = new MediaStream();
      event.streams[0].getTracks().forEach((track) => this.remoteStream!.addTrack(track));
      if (this.remoteVideoRef?.nativeElement) {
        this.remoteVideoRef.nativeElement.srcObject = this.remoteStream;
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState || 'new';
      if (state === 'connected') {
        this.sessionStatus = 'Peer connected.';
      }
      if (state === 'failed' || state === 'disconnected') {
        this.mediaError = `Peer connection ${state}.`;
        this.fallbackToChat('Peer disconnected. Falling back to chat.');
      }
    };
  }

  private attachTracksToPeer(stream: MediaStream): void {
    if (!this.peerConnection) return;
    stream.getTracks().forEach((track) => {
      const sender = this.peerConnection!.getSenders().find((s) => s.track?.id === track.id);
      if (!sender) this.peerConnection!.addTrack(track, stream);
    });
  }

  private attachLocalStream(stream: MediaStream): void {
    if (!this.localVideoRef?.nativeElement) return;
    this.localVideoRef.nativeElement.srcObject = stream;
    this.localVideoRef.nativeElement.muted = true;
    this.localVideoRef.nativeElement.play().catch(() => {
      this.mediaError = 'Local preview could not autoplay. Click video area to start.';
    });
  }

  private closePeerConnectionOnly(): void {
    if (this.peerConnection) {
      this.peerConnection.ontrack = null;
      this.peerConnection.onicecandidate = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((t) => t.stop());
      this.remoteStream = null;
    }
    if (this.remoteVideoRef?.nativeElement) {
      this.remoteVideoRef.nativeElement.srcObject = null;
    }
  }

  private cleanupRealtime(): void {
    this.closePeerConnectionOnly();
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.localVideoRef?.nativeElement) {
      this.localVideoRef.nativeElement.srcObject = null;
    }
    if (this.channel) {
      this.supabaseService.client.removeChannel(this.channel);
      this.channel = null;
    }
    this.realtimeConnected = false;
  }

  private mapMediaError(err: any): string {
    const name = err?.name || '';
    if (name === 'NotAllowedError') return 'Permission denied for camera/microphone. Please allow access.';
    if (name === 'NotFoundError') return 'Camera or microphone not found.';
    if (name === 'NotReadableError') return 'Camera or microphone is busy in another app.';
    return `Media error: ${err?.message || 'Unknown error'}`;
  }
}
