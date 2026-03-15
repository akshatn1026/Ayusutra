const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generates a prescription PDF.
 * @param {Object} prescription - The prescription Mongoose document.
 * @param {Object} doctor - Doctor details.
 * @param {String} outputPath - Path to save the generated PDF.
 * @returns {Promise<String>} - Resolves with the absolute path to the generated PDF.
 */
function generatePrescriptionPdf(prescription, doctor, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });

      // Create directories if they don't exist
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Define green theme colors
      const primaryGreen = '#2e7d32'; // Ayurvedic Green
      const lightGreen = '#a5d6a7';
      const darkText = '#333333';
      const grayText = '#666666';

      // --- HEADER ---
      doc.rect(0, 0, doc.page.width, 100).fill(primaryGreen); // Top banner
      doc.fillColor('white').fontSize(24).font('Helvetica-Bold').text('AYUSUTRA', 40, 30);
      doc.fontSize(12).font('Helvetica').text('Ayurvedic Clinic & Consultation', 40, 60);

      // Doctor Details (Right-aligned in header)
      doc.fontSize(14).font('Helvetica-Bold').text(doctor.name || 'Ayusutra Doctor', 350, 30, { align: 'right' });
      doc.fontSize(10).font('Helvetica').text(doctor.specialization || 'General Ayurveda', 350, 50, { align: 'right' });
      doc.fontSize(10).font('Helvetica').text('Reg No: ' + (doctor.registration || 'AYU-1002'), 350, 65, { align: 'right' });

      // --- PATIENT DETAILS SECTION ---
      doc.moveDown(4);
      doc.rect(40, 110, doc.page.width - 80, 70).fillColor('#f9fbe7').fill(); // Light green background for patient details
      doc.fillColor(primaryGreen).fontSize(14).font('Helvetica-Bold').text('Patient Information', 50, 120);
      
      doc.fillColor(darkText).fontSize(10).font('Helvetica');
      doc.text(`Name: ${prescription.patient_details.name}`, 50, 140);
      doc.text(`Age/Gender: ${prescription.patient_details.age || 'N/A'} / ${prescription.patient_details.gender || 'N/A'}`, 50, 155);
      
      const prescriptionIdStr = prescription._id ? prescription._id.toString() : 'TEMP-ID';
      doc.text(`Date: ${new Date(prescription.created_at).toLocaleDateString()}`, 350, 140);
      doc.text(`Prescription ID: ${Math.random().toString(36).substring(2, 10).toUpperCase()}`, 350, 155);

      // --- CONSULTATION DETAILS ---
      doc.moveDown(2);
      let currentY = 195;
      
      if (prescription.symptoms || prescription.diagnosis) {
        doc.fillColor(primaryGreen).fontSize(12).font('Helvetica-Bold').text('Consultation Summary', 40, currentY);
        doc.moveTo(40, currentY + 15).lineTo(doc.page.width - 40, currentY + 15).strokeColor(lightGreen).stroke();
        currentY += 25;
        
        doc.fillColor(darkText).fontSize(10).font('Helvetica');
        if (prescription.symptoms) {
          doc.font('Helvetica-Bold').text('Symptoms:', 40, currentY);
          doc.font('Helvetica').text(prescription.symptoms, 110, currentY, { width: 400 });
          currentY += doc.heightOfString(prescription.symptoms, { width: 400 }) + 10;
        }
        
        if (prescription.diagnosis) {
          doc.font('Helvetica-Bold').text('Diagnosis:', 40, currentY);
          doc.font('Helvetica').text(prescription.diagnosis, 110, currentY, { width: 400 });
          currentY += doc.heightOfString(prescription.diagnosis, { width: 400 }) + 15;
        }
      }

      // --- MEDICINES TABLE ---
      if (prescription.medicines && prescription.medicines.length > 0) {
        doc.fillColor(primaryGreen).fontSize(12).font('Helvetica-Bold').text('Rx Medicines', 40, currentY);
        
        currentY += 20;
        // Table Header
        doc.rect(40, currentY, doc.page.width - 80, 25).fillAndStroke(lightGreen, lightGreen);
        doc.fillColor('#000').fontSize(10).font('Helvetica-Bold');
        doc.text('Medicine Name', 50, currentY + 7, { width: 140 });
        doc.text('Dosage', 200, currentY + 7, { width: 100 });
        doc.text('Timing', 310, currentY + 7, { width: 100 });
        doc.text('Duration', 420, currentY + 7, { width: 80 });
        
        currentY += 25;
        doc.font('Helvetica');
        
        // Table Rows
        prescription.medicines.forEach((med, index) => {
          if (currentY > doc.page.height - 150) {
            doc.addPage();
            currentY = 40;
          }
          
          const isEvenPage = index % 2 === 0;
          if (isEvenPage) {
            doc.rect(40, currentY, doc.page.width - 80, 25).fill('#f5f5f5');
          }
          
          doc.fillColor(darkText);
          const nameStr = `${med.medicine} ${med.form ? '(' + med.form + ')' : ''}`;
          doc.text(nameStr, 50, currentY + 7, { width: 140, lineBreak: false });
          doc.text(`${med.dosage} ${med.frequency ? '(' + med.frequency + ')' : ''}`, 200, currentY + 7, { width: 100, lineBreak: false });
          doc.text(med.timing || med.instructions || '', 310, currentY + 7, { width: 100, lineBreak: false });
          doc.text(med.duration || '', 420, currentY + 7, { width: 80, lineBreak: false });
          
          currentY += 25;
        });
      }

      currentY += 15;

      // --- LIFESTYLE & DIET ---
      if (currentY > doc.page.height - 200) {
        doc.addPage();
        currentY = 40;
      }
      
      if (prescription.diet_recommendation || prescription.lifestyle_advice || prescription.doctor_notes) {
        doc.fillColor(primaryGreen).fontSize(12).font('Helvetica-Bold').text('Ayurvedic Advice', 40, currentY);
        doc.moveTo(40, currentY + 15).lineTo(doc.page.width - 40, currentY + 15).strokeColor(lightGreen).stroke();
        currentY += 25;
        
        doc.fillColor(darkText).fontSize(10).font('Helvetica');
        
        if (prescription.diet_recommendation) {
          doc.font('Helvetica-Bold').coloredFill(grayText).text('Diet:', 40, currentY);
          doc.font('Helvetica').coloredFill(darkText).text(prescription.diet_recommendation, 120, currentY, { width: doc.page.width - 160 });
          currentY += doc.heightOfString(prescription.diet_recommendation, { width: doc.page.width - 160 }) + 10;
        }
        
        if (prescription.lifestyle_advice) {
          doc.font('Helvetica-Bold').coloredFill(grayText).text('Lifestyle / Yoga:', 40, currentY);
          doc.font('Helvetica').coloredFill(darkText).text(prescription.lifestyle_advice, 120, currentY, { width: doc.page.width - 160 });
          currentY += doc.heightOfString(prescription.lifestyle_advice, { width: doc.page.width - 160 }) + 10;
        }

        if (prescription.doctor_notes) {
          doc.font('Helvetica-Bold').coloredFill(grayText).text('Additional Notes:', 40, currentY);
          doc.font('Helvetica').coloredFill(darkText).text(prescription.doctor_notes, 120, currentY, { width: doc.page.width - 160 });
          currentY += doc.heightOfString(prescription.doctor_notes, { width: doc.page.width - 160 }) + 10;
        }
      }

      // --- FOOTER & SIGNATURE ---
      const footerY = doc.page.height - 120;
      
      // Digital Signature marker
      doc.fillColor(primaryGreen).fontSize(14).font('Helvetica-Oblique').text('Elec. Signed', doc.page.width - 180, footerY - 10);
      doc.fillColor(darkText).fontSize(10).font('Helvetica-Bold').text(doctor.name || 'Doctor Auth', doc.page.width - 180, footerY + 10);
      doc.font('Helvetica').fontSize(8).text('Automatically generated by Ayusutra System', doc.page.width - 180, footerY + 25);

      // Footnote
      doc.moveTo(40, doc.page.height - 50).lineTo(doc.page.width - 40, doc.page.height - 50).strokeColor(lightGreen).stroke();
      doc.fontSize(8).fillColor(grayText).text(
        'This is a digitally generated prescription. Wishing you a fast recovery according to Ayurvedic principles.',
        40, doc.page.height - 40, { align: 'center' }
      );

      doc.end();

      stream.on('finish', () => resolve(outputPath));
      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

// Add a helper method specifically for changing color context in PDFKit easily
PDFDocument.prototype.coloredFill = function(color) {
  this.fillColor(color);
  return this;
};

module.exports = { generatePrescriptionPdf };
