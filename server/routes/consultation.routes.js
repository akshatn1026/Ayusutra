const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const authMiddleware = require('../middleware/auth.middleware');
const crypto = require('crypto');

router.get('/doctors', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .order('rating', { ascending: false });

    if (error) throw error;
    res.json({ doctors: data });
  } catch (err) {
    console.error('Error fetching doctors:', err);
    res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

router.get('/doctors/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select('*, doctor_availability(*)')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error fetching doctor profile:', err);
    res.status(500).json({ error: 'Failed to fetch doctor profile' });
  }
});

router.get('/available-slots/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const endDate = nextWeek.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('consultation_slots')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('is_booked', false)
      .eq('is_blocked', false)
      .gte('date', today)
      .lte('date', endDate)
      .order('date')
      .order('start_time');

    if (error) throw error;
    res.json({ slots: data });
  } catch (err) {
    console.error('Error fetching slots:', err);
    res.status(500).json({ error: 'Failed to fetch available slots' });
  }
});


router.post('/book', authMiddleware, async (req, res) => {
  try {
    const { doctor_id, slot_id, type, mode, patient_notes, issueContext, scheduledTime } = req.body;
    const patient_id = req.user.id;

    const final_doctor_id = doctor_id || req.body.doctorId;
    const final_type = type || mode || 'chat';
    const final_notes = patient_notes || issueContext || '';

    if (slot_id) {
      const { data: slot, error: slotError } = await supabase
        .from('consultation_slots')
        .select('*')
        .eq('id', slot_id)
        .single();

      if (slotError || !slot || slot.is_booked || slot.is_blocked) {
        return res.status(400).json({ error: 'Slot is no longer available' });
      }

      await supabase.from('consultation_slots').update({ is_booked: true }).eq('id', slot_id);
    }

    const room_id = `room_${crypto.randomUUID()}`;
    const { data: consultation, error: consultError } = await supabase
      .from('consultations')
      .insert({
        patient_id,
        doctor_id: final_doctor_id,
        slot_id: slot_id || null,
        type: final_type,
        status: 'confirmed',
        room_id,
        notes: final_notes,
        started_at: scheduledTime || new Date().toISOString()
      })
      .select('*, doctors(*)')
      .single();

    if (consultError) throw consultError;

    res.json({
      success: true,
      consultation_id: consultation.id,
      booking: consultation, 
      room_id,
      join_url: `/consult/room/${room_id}`
    });

  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Failed to book consultation' });
  }
});

router.post('/emergency', authMiddleware, async (req, res) => {
  try {
    const patient_id = req.user.id;

    const { data: doctor, error: docError } = await supabase
      .from('doctors')
      .select('*')
      .eq('is_available_now', true)
      .lt('online_minutes_today', 120) 
      .limit(1)
      .maybeSingle();

    if (docError) throw docError;

    if (!doctor) {
      return res.status(404).json({ error: 'No doctors currently available for emergency. You have been added to the queue.', inQueue: true });
    }

    const room_id = `room_${crypto.randomUUID()}`;
    const { data: consultation, error: consultError } = await supabase
      .from('consultations')
      .insert({
        patient_id,
        doctor_id: doctor.id,
        type: 'emergency',
        status: 'active',
        room_id,
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (consultError) throw consultError;

    await supabase.from('doctors').update({ is_available_now: false }).eq('id', doctor.id);

    res.json({
      success: true,
      consultation_id: consultation.id,
      room_id,
      doctor
    });

  } catch (err) {
    console.error('Emergency error:', err);
    res.status(500).json({ error: 'Failed to start emergency session' });
  }
});

router.get('/my-bookings', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabase
      .from('consultations')
      .select('*, doctor:doctors(*), patient:users(name, email)') 
      .or(`patient_id.eq.${userId},doctor_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    const now = new Date();
    const upcoming = data.filter(b => b.status === 'confirmed' || b.status === 'active' || new Date(b.started_at || b.created_at) >= now);
    const past = data.filter(b => b.status === 'completed' || b.status === 'cancelled' || new Date(b.ended_at || b.created_at) < now);

    res.json({ 
      bookings: data,
      upcoming,
      past
    });
  } catch (err) {
    console.error('Error fetching bookings:', err);
    res.status(500).json({ error: 'Failed to fetch your bookings' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('consultations')
      .select('*, doctors(*), consultation_messages(*)')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error fetching consultation:', err);
    res.status(500).json({ error: 'Failed to fetch consultation details' });
  }
});

router.post('/:id/end', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const ended_at = new Date().toISOString();

    const { data: consult, error: fetchError } = await supabase
      .from('consultations')
      .select('started_at, doctor_id')
      .eq('id', id)
      .single();

    if (fetchError || !consult) throw new Error('Consultation not found');

    const start = new Date(consult.started_at || consult.created_at);
    const end = new Date(ended_at);
    const duration = Math.round((end - start) / (1000 * 60));

    const { error: updateError } = await supabase
      .from('consultations')
      .update({
        status: 'completed',
        ended_at,
        duration_minutes: duration
      })
      .eq('id', id);

    if (updateError) throw updateError;

   
    
    res.json({ success: true, duration });
  } catch (err) {
    console.error('Error ending consultation:', err);
    res.status(500).json({ error: 'Failed to end session' });
  }
});
router.post('/generate-slots', authMiddleware, async (req, res) => {
  try {
    const doctor_id = req.user.id;
    const { data: doctor } = await supabase.from('doctors').select('id').eq('id', doctor_id).single();
    if (!doctor) return res.status(403).json({ error: 'Only doctors can generate slots' });

    const { data: availability } = await supabase
      .from('doctor_availability')
      .select('*')
      .eq('doctor_id', doctor_id)
      .eq('is_active', true);

    if (!availability || availability.length === 0) {
      return res.status(400).json({ error: 'No active availability found. Please set your hours first.' });
    }

    const slotsToInsert = [];
    const now = new Date();

    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(now.getDate() + i);
      const dayOfWeek = date.getDay();
      const dateStr = date.toISOString().split('T')[0];

      const dayAvailability = availability.filter(a => a.day_of_week === dayOfWeek);
      
      for (const av of dayAvailability) {
        let current = av.start_time;
        
        const [startH, startM] = av.start_time.split(':').map(Number);
        const [endH, endM] = av.end_time.split(':').map(Number);
        
        let startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        while (startMinutes + 30 <= endMinutes) {
          const sH = Math.floor(startMinutes / 60).toString().padStart(2, '0');
          const sM = (startMinutes % 60).toString().padStart(2, '0');
          const eH = Math.floor((startMinutes + 30) / 60).toString().padStart(2, '0');
          const eM = ((startMinutes + 30) % 60).toString().padStart(2, '0');

          slotsToInsert.push({
            doctor_id,
            date: dateStr,
            start_time: `${sH}:${sM}:00`,
            end_time: `${eH}:${eM}:00`,
            duration_minutes: 30
          });
          startMinutes += 30;
        }
      }
    }

    const { error } = await supabase
      .from('consultation_slots')
      .upsert(slotsToInsert, { onConflict: 'doctor_id, date, start_time' });

    if (error) throw error;
    res.json({ success: true, count: slotsToInsert.length });

  } catch (err) {
    console.error('Slot generation error:', err);
    res.status(500).json({ error: 'Failed to generate slots' });
  }
});

router.put('/availability', authMiddleware, async (req, res) => {
  try {
    const { is_available_now } = req.body;
    const { error } = await supabase
      .from('doctors')
      .update({ is_available_now })
      .eq('id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Availability update error:', err);
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

module.exports = router;
