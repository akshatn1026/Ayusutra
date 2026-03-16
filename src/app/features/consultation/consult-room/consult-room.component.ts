import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { RealtimeService } from '../../../core/services/realtime.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AvailabilityService } from '../../../services/availability.service';
// @ts-ignore
import Peer from 'simple-peer';

interface ChatMessage {
  sender_id: string;
  sender_name: string;
  message: string;
  created_at: string;
  message_type: 'text' | 'system';
}

@Component({
  selector: 'app-consult-room',
  templateUrl: './consult-room.component.html',
  styleUrls: ['./consult-room.component.scss']
})
export class ConsultRoomComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  @ViewChild('localVideo') localVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideo!: ElementRef<HTMLVideoElement>;

  roomId: string = '';
  consultationId: string = '';
  currentUserId: string = '';
  currentUserName: string = '';
  isDoctor: boolean = false;
  
  // UI State
  activeTab: 'chat' | 'audio' | 'video' = 'chat';
  loading: boolean = true;
  otherJoined: boolean = false;
  status: 'connecting' | 'connected' | 'disconnected' | 'waiting' = 'waiting';
  
  // Chat
  messages: ChatMessage[] = [];
  newMessage: string = '';
  isTyping: boolean = false;
  
  // WebRTC
  peer: any;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  isMuted: boolean = false;
  isCameraOff: boolean = false;
  isScreenSharing: boolean = false;
  
  // Timer
  elapsedSeconds: number = 0;
  timerInterval: any;
  onlineMinutesUsed: number = 0;
  readonly DAILY_LIMIT = 120;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private realtime: RealtimeService,
    private supabase: SupabaseService,
    private availabilityService: AvailabilityService
  ) {}

  async ngOnInit() {
    this.roomId = this.route.snapshot.params['roomId'] || this.route.snapshot.params['sessionId'];
    if (!this.roomId) {
      this.router.navigate(['/dashboard']);
      return;
    }

    await this.loadSessionContext();
    this.setupRealtime();
    this.startTimer();

    if (this.isDoctor) {
      this.availabilityService.onlineMinutes.subscribe(m => {
        this.onlineMinutesUsed = m;
      });
    }
  }

  ngOnDestroy() {
    this.stopSession();
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.realtime.leaveConsultation(this.roomId);
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private async loadSessionContext() {
    const { data: { user } } = await this.supabase.client.auth.getUser();
    if (!user) {
      this.router.navigate(['/login']);
      return;
    }
    this.currentUserId = user.id;

    // Fetch consultation details
    const { data: consultation, error } = await this.supabase.client
      .from('consultations')
      .select('*, doctors(*)')
      .eq('room_id', this.roomId)
      .maybeSingle();

    if (error || !consultation) {
      console.error('Consultation not found', error);
      this.router.navigate(['/dashboard']);
      return;
    }

    this.consultationId = consultation.id;
    this.isDoctor = consultation.doctor_id === this.currentUserId;
    
    // Fetch profile for name
    const { data: profile } = await this.supabase.client
      .from('users')
      .select('name')
      .eq('id', this.currentUserId)
      .single();
    
    this.currentUserName = profile?.name || 'User';

    // Load initial messages
    const { data: history } = await this.supabase.client
      .from('consultation_messages')
      .select('*')
      .eq('consultation_id', this.consultationId)
      .order('created_at', { ascending: true });
    
    if (history) {
      this.messages = history.map((m: any) => ({
        sender_id: m.sender_id,
        sender_name: m.sender_id === this.currentUserId ? 'Me' : 'Other', // In real app, fetch names properly
        message: m.message,
        created_at: m.created_at,
        message_type: m.message_type as any
      }));
    }

    this.loading = false;
  }

  private setupRealtime() {
    this.realtime.joinConsultation(this.roomId, (payload: any) => {
      if (payload.event === 'chat-message') {
        this.messages.push(payload.data);
      }
    });

    // Handle signals via RealtimeService
    this.realtime.signaling$.subscribe((signalData: any) => {
      if (signalData.sessionId !== this.roomId) return;
      const payload = signalData.payload;
      
      if (payload.senderId === this.currentUserId) return;
      
      if (payload.type === 'offer') {
        this.initPeer(false, payload.signal);
      } else if (payload.type === 'answer') {
        this.peer?.signal(payload.signal);
      } else if (payload.type === 'candidate') {
        this.peer?.signal(payload.signal);
      } else if (payload.type === 'joined') {
        this.otherJoined = true;
        this.messages.push({
          sender_id: 'system',
          sender_name: 'System',
          message: 'Other person has joined the room.',
          created_at: new Date().toISOString(),
          message_type: 'system'
        });
      }
    });

    // Broadcast that we joined
    this.realtime.sendSignal(this.roomId, { type: 'joined', senderId: this.currentUserId });
  }

  // --- CHAT LOGIC ---

  async sendChatMessage() {
    if (!this.newMessage.trim()) return;

    const messageData: ChatMessage = {
      sender_id: this.currentUserId,
      sender_name: this.currentUserName,
      message: this.newMessage.trim(),
      created_at: new Date().toISOString(),
      message_type: 'text'
    };

    // 1. Save to DB
    await this.supabase.client.from('consultation_messages').insert({
      consultation_id: this.consultationId,
      sender_id: this.currentUserId,
      message: messageData.message,
      message_type: 'text'
    });

    // 2. Broadcast
    this.realtime.sendMessage(this.roomId, { event: 'chat-message', data: messageData });
    
    // 3. Update local
    this.messages.push(messageData);
    this.newMessage = '';
  }

  // --- WEBRTC LOGIC ---

  async startCall(video: boolean = true) {
    this.activeTab = video ? 'video' : 'audio';
    await this.initPeer(true);
  }

  async initPeer(initiator: boolean, incomingSignal?: any) {
    try {
      if (this.peer) this.peer.destroy();

      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: this.activeTab === 'video',
        audio: true
      });

      if (this.localVideo) {
        this.localVideo.nativeElement.srcObject = this.localStream;
      }

      this.peer = new Peer({
        initiator,
        trickle: false,
        stream: this.localStream,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      this.peer.on('signal', (data: any) => {
        const type = data.type === 'offer' ? 'offer' : (data.type === 'answer' ? 'answer' : 'candidate');
        this.realtime.sendSignal(this.roomId, {
          type,
          senderId: this.currentUserId,
          signal: data
        });
      });

      this.peer.on('stream', (stream: MediaStream) => {
        this.remoteStream = stream;
        this.status = 'connected';
        if (this.remoteVideo) {
          this.remoteVideo.nativeElement.srcObject = stream;
        }
      });

      this.peer.on('connect', () => {
        this.status = 'connected';
      });

      this.peer.on('close', () => {
        this.status = 'disconnected';
      });

      this.peer.on('error', (err: any) => {
        console.error('Peer error:', err);
        this.status = 'disconnected';
      });

      if (incomingSignal) {
        this.peer.signal(incomingSignal);
      }

    } catch (err: any) {
      console.error('WebRTC Init Error:', err);
      alert('Could not access camera/microphone. Please check permissions.');
    }
  }

  toggleMute() {
    if (this.localStream) {
      this.isMuted = !this.isMuted;
      this.localStream.getAudioTracks().forEach(track => track.enabled = !this.isMuted);
    }
  }

  toggleCamera() {
    if (this.localStream) {
      this.isCameraOff = !this.isCameraOff;
      this.localStream.getVideoTracks().forEach(track => track.enabled = !this.isCameraOff);
    }
  }

  async endSession() {
    if (confirm('Are you sure you want to end this consultation?')) {
      await this.supabase.client.from('consultations')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', this.consultationId);
      
      this.router.navigate(['/dashboard']);
    }
  }

  private stopSession() {
    this.localStream?.getTracks().forEach(t => t.stop());
    this.peer?.destroy();
  }

  // --- UI ELPERS ---

  get timerDisplay(): string {
    const mins = Math.floor(this.elapsedSeconds / 60);
    const secs = this.elapsedSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  private startTimer() {
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;
      if (this.elapsedSeconds === 25 * 60) {
        alert('5 minutes remaining in your session.');
      }
      if (this.elapsedSeconds >= 30 * 60) {
        this.endSession();
      }
    }, 1000);
  }

  private scrollToBottom() {
    try {
      const el = this.scrollContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    } catch {}
  }
}
