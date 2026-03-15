const { supabase } = require('../lib/supabase');

const PrescriptionModel = {
  async create(data) {
    const { data: result, error } = await supabase
      .from('prescriptions')
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return result;
  },

  async findByPatient(patientId) {
    const { data, error } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async findByAppointment(appointmentId) {
    const { data, error } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('appointment_id', appointmentId)
      .single();
    if (error) throw error;
    return data;
  }
};

module.exports = PrescriptionModel;
