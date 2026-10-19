require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const getAdminDashboardHTML = require('./admin.js');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));

// ==========================================
// 1. DATABASE SETUP & MODELS
// ==========================================
let cachedDb = null;
async function connectDB() {
    if (cachedDb) return cachedDb;
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is strictly required");
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    cachedDb = mongoose.connection;
    await provisionAdmin();
    return cachedDb;
}

const appointmentSchema = new mongoose.Schema({
    bookingReference: { type: String, unique: true },
    patientName: { type: String, required: true },
    patientPhone: { type: String, required: true },
    doctorId: String,
    doctorName: String,
    serviceName: String,
    appointmentDate: { type: String, required: true },
    appointmentTime: { type: String, required: true },
    paymentMethod: { type: String, enum: ['upi', 'cash'] },
    paymentStatus: { type: String, enum: ['unpaid', 'payment_pending_verification', 'paid', 'failed'] },
    appointmentStatus: { type: String, enum: ['pending', 'confirmed', 'cancelled', 'completed'], default: 'pending' },
    transactionReference: String
}, { timestamps: true });

appointmentSchema.index({ doctorId: 1, appointmentDate: 1, appointmentTime: 1 }, { unique: true });
const Appointment = mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);

const adminSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    passwordHash: String,
    role: { type: String, default: 'admin' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });
const AdminUser = mongoose.models.AdminUser || mongoose.model('AdminUser', adminSchema);

async function provisionAdmin() {
    const count = await AdminUser.countDocuments();
    if (count === 0 && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH) {
        await AdminUser.create({
            username: process.env.ADMIN_USERNAME,
            passwordHash: process.env.ADMIN_PASSWORD_HASH
        });
    }
}

// ==========================================
// 2. MIDDLEWARES & CONFIG
// ==========================================
const JWT_SECRET = process.env.SESSION_SECRET || 'fallback_dev_secret_only';

const requireAdmin = async (req, res, next) => {
    try {
        const token = req.cookies.admin_token;
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Session expired or invalid' });
    }
};

const CLINIC_CONFIG = {
    name: process.env.CLINIC_NAME || "DENTAL CLINIC MORADABAD",
    address: process.env.CLINIC_ADDRESS || "RAILWAY STATION, MORADABAD, UP, 244501",
    phone: process.env.CLINIC_PHONE || "+91 9927766450",
    whatsapp: process.env.CLINIC_WHATSAPP || "+91 7060969508",
    email: process.env.CLINIC_EMAIL || "anmolsingh99277@gmail.com",
    upiId: process.env.CLINIC_UPI_ID || "6397319508@fam",
    qrUrl: process.env.CLINIC_QR_IMAGE_URL || "",
    doctors: [
        { id: 'dr_shivaditya', name: 'Dr. ShivAditya Sharma', spec: 'Root Canal Specialist, MDS (Cons & Endo), Ex-Assistant Professor' },
        { id: 'dr_parul', name: 'Dr. Parul Sharma', spec: 'Expert Dental Surgeon' }
    ],
    services: [
        "Dental Consultation", "Root Canal Treatment", "Dental Cleaning", 
        "Dental Fillings", "Tooth Pain Consultation", "Gum Care"
    ]
};

// ==========================================
// 3. API ENDPOINTS (PUBLIC)
// ==========================================
app.get('/api/health', async (req, res) => {
    try { await connectDB(); res.json({ status: 'ok', db: 'connected' }); }
    catch (e) { res.status(500).json({ status: 'error', error: e.message }); }
});

app.get('/api/clinic', (req, res) => res.json(CLINIC_CONFIG));

app.get('/api/availability', async (req, res) => {
    try {
        await connectDB();
        const { date, doctorId } = req.query;
        if (!date || !doctorId) return res.status(400).json({ error: 'Date and Doctor ID required' });
        
        const dayOfWeek = new Date(date).getDay();
        if (dayOfWeek === 0) return res.json({ availableSlots: [] }); // Sundays closed

        const allSlots = [];
        for (let hour = 8; hour <= 18; hour++) {
            allSlots.push(`${hour.toString().padStart(2, '0')}:00`);
            allSlots.push(`${hour.toString().padStart(2, '0')}:30`);
        }
        
        const booked = await Appointment.find({ appointmentDate: date, doctorId, appointmentStatus: { $ne: 'cancelled' } });
        const bookedTimes = booked.map(b => b.appointmentTime);
        const availableSlots = allSlots.filter(s => !bookedTimes.includes(s));
        
        res.json({ availableSlots });
    } catch (e) { res.status(500).json({ error: 'Failed to fetch availability' }); }
});

app.post('/api/appointments', async (req, res) => {
    try {
        await connectDB();
        const { patientName, patientPhone, doctorId, serviceName, appointmentDate, appointmentTime, paymentMethod, transactionReference } = req.body;
        
        const apptDateObj = new Date(`${appointmentDate}T${appointmentTime}:00+05:30`);
        if (apptDateObj < new Date()) return res.status(400).json({ error: "Cannot book in the past" });
        if (new Date(appointmentDate).getDay() === 0) return res.status(400).json({ error: "Clinic closed on Sundays" });

        const doc = CLINIC_CONFIG.doctors.find(d => d.id === doctorId);
        
        const bookingReference = 'BKG-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        const paymentStatus = paymentMethod === 'upi' ? 'payment_pending_verification' : 'unpaid';

        const appt = new Appointment({
            bookingReference, patientName, patientPhone, doctorId, doctorName: doc.name,
            serviceName, appointmentDate, appointmentTime, paymentMethod, paymentStatus, transactionReference
        });

        await appt.save();
        res.json({ success: true, bookingReference, paymentStatus });
    } catch (e) {
        if (e.code === 11000) return res.status(409).json({ error: 'This time slot was just booked by someone else. Please select another.' });
        res.status(500).json({ error: 'Failed to book appointment' });
    }
});

// ==========================================
// 4. API ENDPOINTS (ADMIN)
// ==========================================
app.post('/api/admin/login', async (req, res) => {
    try {
        await connectDB();
        const { username, password } = req.body;
        const user = await AdminUser.findOne({ username, isActive: true });
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
        res.cookie('admin_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.json({ success: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => res.json({ success: true, role: req.admin.role }));

app.get('/api/admin/appointments', requireAdmin, async (req, res) => {
    try {
        await connectDB();
        const appointments = await Appointment.find().sort({ appointmentDate: -1, appointmentTime: -1 }).limit(100);
        res.json(appointments);
    } catch (e) { res.status(500).json({ error: 'Failed to fetch' }); }
});

app.patch('/api/admin/appointments/:id', requireAdmin, async (req, res) => {
    try {
        await connectDB();
        await Appointment.findByIdAndUpdate(req.params.id, { appointmentStatus: req.body.appointmentStatus });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Update failed' }); }
});

app.post('/api/admin/payments/:id/verify', requireAdmin, async (req, res) => {
    try {
        await connectDB();
        await Appointment.findByIdAndUpdate(req.params.id, { paymentStatus: 'paid' });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Verification failed' }); }
});

app.post('/api/admin/payments/:id/mark-received', requireAdmin, async (req, res) => {
    try {
        await connectDB();
        await Appointment.findByIdAndUpdate(req.params.id, { paymentStatus: 'paid' });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Update failed' }); }
});

// ==========================================
// 5. PUBLIC FRONTEND & ADMIN ROUTES
// ==========================================
app.get('/admin', (req, res) => {
    res.send(getAdminDashboardHTML());
});

app.get('/', (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dental Clinic Moradabad | Premium Dental Care</title>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #F4F8FF;
            --primary: #4F7CFF;
            --light-blue: #C9E8FF;
            --mint: #B8F3DC;
            --lavender: #DCCBFF;
            --coral: #FFB7A8;
            --text: #24324A;
            --white: #FFFFFF;
            --clay-shadow: 8px 8px 16px #d1d9e6, -8px -8px 16px #ffffff;
            --clay-inset: inset 2px 2px 4px rgba(255,255,255,0.7), inset -2px -2px 4px rgba(0,0,0,0.05);
            --transition: all 0.3s ease;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Poppins', sans-serif; scroll-behavior: smooth; }
        body { background: var(--bg); color: var(--text); overflow-x: hidden; }
        
        .announcement { background: var(--primary); color: var(--white); text-align: center; padding: 10px; font-size: 0.9rem; font-weight: 500; }
        
        nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 5%; background: rgba(244, 248, 255, 0.9); backdrop-filter: blur(10px); position: sticky; top: 0; z-index: 100; }
        .logo { font-size: 1.5rem; font-weight: 700; color: var(--primary); display: flex; align-items: center; gap: 10px; }
        .nav-links { display: flex; gap: 24px; }
        .nav-links a { text-decoration: none; color: var(--text); font-weight: 500; transition: var(--transition); }
        .nav-links a:hover { color: var(--primary); }

        .clay-card {
            background: var(--bg); border-radius: 24px; box-shadow: var(--clay-shadow), var(--clay-inset);
            padding: 32px; border: 1px solid rgba(255,255,255,0.5); position: relative; overflow: hidden;
        }

        .clay-btn {
            background: var(--primary); color: var(--white); border: none; border-radius: 16px;
            padding: 14px 28px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: var(--transition);
            box-shadow: 6px 6px 12px #d1d9e6, -6px -6px 12px #ffffff, inset 2px 2px 4px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(0,0,0,0.1);
            text-decoration: none; display: inline-block;
        }
        .clay-btn:active { transform: translateY(3px); box-shadow: inset 4px 4px 8px rgba(0,0,0,0.1), inset -4px -4px 8px rgba(255,255,255,0.4); }
        .clay-btn.secondary { background: var(--lavender); color: var(--text); }
        .clay-btn.outline { background: transparent; border: 2px solid var(--primary); color: var(--primary); }

        .clay-input {
            background: var(--bg); border: none; border-radius: 16px; padding: 16px; width: 100%;
            box-shadow: inset 4px 4px 8px #d1d9e6, inset -4px -4px 8px #ffffff; color: var(--text);
            font-size: 1rem; margin-top: 8px; outline: none; transition: var(--transition);
        }
        .clay-input:focus { box-shadow: inset 6px 6px 12px #c3cbd8, inset -6px -6px 12px #ffffff; }

        section { padding: 80px 5%; max-width: 1400px; margin: 0 auto; }
        .section-title { text-align: center; font-size: 2.5rem; margin-bottom: 40px; color: var(--primary); }

        /* Hero */
        .hero { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: center; min-height: 80vh; }
        .hero-text h1 { font-size: 3.5rem; line-height: 1.2; margin-bottom: 24px; }
        .hero-text p { font-size: 1.1rem; margin-bottom: 32px; opacity: 0.9; }
        .hero-graphics { position: relative; height: 100%; display: flex; justify-content: center; align-items: center; }
        .floating-shape { position: absolute; border-radius: 50%; background: linear-gradient(135deg, var(--light-blue), var(--mint)); width: 300px; height: 300px; animation: float 6s ease-in-out infinite; z-index: -1; filter: blur(20px); }

        /* Grids */
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 32px; }

        /* Booking Form */
        .booking-steps { display: flex; justify-content: space-between; margin-bottom: 32px; position: relative; }
        .step-indicator { width: 40px; height: 40px; border-radius: 50%; background: var(--bg); box-shadow: var(--clay-shadow); display: flex; align-items: center; justify-content: center; font-weight: 600; z-index: 2; transition: 0.3s; }
        .step-indicator.active { background: var(--primary); color: var(--white); box-shadow: var(--clay-inset); }
        .step-content { display: none; animation: fadeIn 0.4s ease forwards; }
        .step-content.active { display: block; }
        
        .slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 16px; margin-top: 16px; }
        .time-slot { background: var(--bg); border: none; padding: 12px; border-radius: 12px; box-shadow: var(--clay-shadow); cursor: pointer; text-align: center; transition: 0.2s; font-weight: 500; }
        .time-slot:hover { transform: translateY(-2px); }
        .time-slot.selected { background: var(--primary); color: var(--white); box-shadow: var(--clay-inset); }
        .time-slot:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }

        .payment-card { cursor: pointer; border: 2px solid transparent; transition: 0.3s; }
        .payment-card.selected { border-color: var(--primary); background: var(--light-blue); }

        /* Footer */
        footer { background: #E8F0FE; padding: 60px 5% 20px; text-align: center; margin-top: 80px; border-top-left-radius: 40px; border-top-right-radius: 40px; }
        .footer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 40px; text-align: left; margin-bottom: 40px; }

        @keyframes float { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-20px) scale(1.05); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        @media(max-width: 768px) {
            .hero { grid-template-columns: 1fr; text-align: center; }
            .hero-text h1 { font-size: 2.5rem; }
            .nav-links { display: none; } /* Mobile menu simplified for 4-file structure */
        }
    </style>
</head>
<body>

<div class="announcement">✨ Your Smile, Our Priority — Book Your Dental Appointment Today! ✨</div>

<nav>
    <div class="logo">🦷 DENTAL CLINIC MORADABAD</div>
    <div class="nav-links">
        <a href="#about">About</a>
        <a href="#doctors">Doctors</a>
        <a href="#services">Services</a>
        <a href="#booking" class="clay-btn" style="padding: 8px 16px; border-radius: 12px;">Book Now</a>
    </div>
</nav>

<section class="hero" id="home">
    <div class="hero-text">
        <h1>Your Journey to a Healthier, Brighter Smile Starts Here!</h1>
        <p>Discover personalized dental care and convenient appointment booking at Moradabad's premium dental facility.</p>
        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
            <a href="#booking" class="clay-btn">BOOK APPOINTMENT</a>
            <a href="#contact" class="clay-btn secondary">CONTACT CLINIC</a>
        </div>
    </div>
    <div class="hero-graphics">
        <div class="floating-shape"></div>
        <div class="clay-card" style="padding: 40px; border-radius: 50%;">
            <span style="font-size: 8rem;">🦷</span>
        </div>
    </div>
</section>

<section id="doctors">
    <h2 class="section-title">Meet Our Experts</h2>
    <div class="grid" id="doctors-grid">
        <!-- Populated via JS -->
    </div>
</section>

<section id="services">
    <h2 class="section-title">Premium Dental Services</h2>
    <div class="grid" id="services-grid">
        <!-- Populated via JS -->
    </div>
</section>

<section id="booking">
    <h2 class="section-title">Book Your Appointment</h2>
    <div class="clay-card" style="max-width: 800px; margin: 0 auto;">
        
        <div class="booking-steps">
            <div class="step-indicator active" id="ind-1">1</div>
            <div class="step-indicator" id="ind-2">2</div>
            <div class="step-indicator" id="ind-3">3</div>
            <div class="step-indicator" id="ind-4">4</div>
        </div>

        <div id="step-1" class="step-content active">
            <h3>Patient Details</h3>
            <div style="margin-top: 16px;">
                <label>Full Name *</label>
                <input type="text" id="b-name" class="clay-input" required>
            </div>
            <div style="margin-top: 16px;">
                <label>Mobile Number *</label>
                <input type="tel" id="b-phone" class="clay-input" required>
            </div>
            <button class="clay-btn" style="margin-top: 24px; width: 100%;" onclick="nextStep(2)">Continue to Schedule</button>
        </div>

        <div id="step-2" class="step-content">
            <h3>Select Date & Time</h3>
            <div style="margin-top: 16px;">
                <label>Select Doctor</label>
                <select id="b-doctor" class="clay-input" onchange="fetchSlots()"></select>
            </div>
            <div style="margin-top: 16px;">
                <label>Select Service</label>
                <select id="b-service" class="clay-input"></select>
            </div>
            <div style="margin-top: 16px;">
                <label>Date * (Mon-Sat)</label>
                <input type="date" id="b-date" class="clay-input" onchange="fetchSlots()" required>
            </div>
            <div style="margin-top: 16px;">
                <label>Available Times</label>
                <div class="slot-grid" id="slot-container">
                    <p style="grid-column: 1/-1; opacity: 0.6;">Select a date and doctor to view slots.</p>
                </div>
            </div>
            <div style="display:flex; gap: 16px; margin-top: 24px;">
                <button class="clay-btn secondary" style="flex: 1;" onclick="prevStep(1)">Back</button>
                <button class="clay-btn" style="flex: 1;" onclick="nextStep(3)" id="btn-to-3" disabled>Review Booking</button>
            </div>
        </div>

        <div id="step-3" class="step-content">
            <h3>Payment Method</h3>
            <p style="margin-top: 16px; font-weight: 500;">Consultation Fee: <span style="color:var(--primary);">To be confirmed by clinic</span></p>
            <div class="grid" style="margin-top: 24px; gap: 16px;">
                <div class="clay-card payment-card" id="pay-upi" onclick="selectPayment('upi')">
                    <h4 style="color:var(--primary);">📱 Online UPI Payment</h4>
                    <p style="font-size: 0.9rem; margin-top: 8px;">Scan QR or use UPI link on the next step to securely pay via PhonePe, GPay, Paytm.</p>
                </div>
                <div class="clay-card payment-card" id="pay-cash" onclick="selectPayment('cash')">
                    <h4 style="color:var(--primary);">💵 Pay at Clinic - Cash</h4>
                    <p style="font-size: 0.9rem; margin-top: 8px;">Reserve your slot now and pay directly at the reception desk.</p>
                </div>
            </div>
            <div style="display:flex; gap: 16px; margin-top: 24px;">
                <button class="clay-btn secondary" style="flex: 1;" onclick="prevStep(2)">Back</button>
                <button class="clay-btn" style="flex: 1;" onclick="submitBooking()" id="btn-submit" disabled>Confirm Booking</button>
            </div>
        </div>

        <div id="step-4" class="step-content" style="text-align: center;">
            <div style="font-size: 4rem; margin-bottom: 16px;">🎉</div>
            <h3 style="color: var(--primary);">Booking Request Submitted!</h3>
            <p style="margin-top: 16px; font-size: 1.1rem;">Your Reference: <strong id="res-ref"></strong></p>
            
            <div id="upi-instructions" style="display: none; margin-top: 24px; padding: 24px; border-radius: 16px; background: var(--light-blue);">
                <h4>Complete Your Payment</h4>
                <p style="margin-bottom: 16px;">Please scan the QR code below or click the UPI button to finalize your reservation.</p>
                <img id="clinic-qr" src="" alt="Clinic UPI QR Code" style="max-width: 250px; border-radius: 12px; box-shadow: var(--clay-shadow); display: none; margin: 0 auto 16px;">
                <p style="font-weight: 600; margin-bottom: 16px;">UPI ID: <span id="clinic-upi-id"></span></p>
                <a id="upi-link" href="#" class="clay-btn" style="display: inline-block;">Pay via UPI App</a>
                <p style="margin-top: 16px; font-size: 0.85rem; opacity: 0.8;">Your appointment status is "Pending Verification" until payment is verified by our staff.</p>
            </div>
            
            <div id="cash-instructions" style="display: none; margin-top: 24px;">
                <p>Your appointment has been reserved. Please arrive 10 minutes early to complete your payment at the clinic.</p>
            </div>
        </div>

    </div>
</section>

<footer id="contact">
    <div class="footer-grid">
        <div>
            <h3 style="color: var(--primary); margin-bottom: 16px;">DENTAL CLINIC MORADABAD</h3>
            <p>Premium Dental Care & Expert Consultations.</p>
        </div>
        <div>
            <h4 style="margin-bottom: 16px;">Contact Information</h4>
            <p>📍 <span id="f-addr"></span></p>
            <p>📞 <a href="#" id="f-phone" style="text-decoration:none; color:inherit;"></a></p>
            <p>💬 <a href="#" id="f-wa" style="text-decoration:none; color:inherit;"></a></p>
            <p>✉️ <span id="f-email"></span></p>
        </div>
        <div>
            <h4 style="margin-bottom: 16px;">Opening Hours</h4>
            <p>Monday - Saturday</p>
            <p><strong>8:00 AM - 7:00 PM</strong></p>
            <p>Sunday: Closed</p>
        </div>
    </div>
    <div style="border-top: 1px solid rgba(0,0,0,0.1); padding-top: 20px; font-size: 0.9rem;">
        &copy; 2026 Dental Clinic Moradabad. All Rights Reserved. | <a href="/admin" style="color: var(--primary);">Admin Login</a>
    </div>
</footer>

<script>
    let clinicData = {};
    let bookingData = { paymentMethod: null, time: null };

    async function init() {
        const res = await fetch('/api/clinic');
        clinicData = await res.json();
        
        // Populate UI
        const docGrid = document.getElementById('doctors-grid');
        const docSelect = document.getElementById('b-doctor');
        clinicData.doctors.forEach(d => {
            docGrid.innerHTML += \`<div class="clay-card">
                <h3 style="color:var(--primary); font-size:1.4rem;">\${d.name}</h3>
                <p style="margin-top:8px; font-weight:500;">\${d.spec}</p>
                <button class="clay-btn outline" style="margin-top:16px; width:100%;" onclick="document.getElementById('booking').scrollIntoView();">Book Appointment</button>
            </div>\`;
            docSelect.innerHTML += \`<option value="\${d.id}">\${d.name}</option>\`;
        });

        const srvGrid = document.getElementById('services-grid');
        const srvSelect = document.getElementById('b-service');
        clinicData.services.forEach(s => {
            srvGrid.innerHTML += \`<div class="clay-card" style="text-align:center;"><h4 style="margin-top:8px;">\${s}</h4></div>\`;
            srvSelect.innerHTML += \`<option value="\${s}">\${s}</option>\`;
        });

        document.getElementById('f-addr').textContent = clinicData.address;
        document.getElementById('f-phone').textContent = clinicData.phone;
        document.getElementById('f-phone').href = 'tel:' + clinicData.phone.replace(/\\s/g,'');
        document.getElementById('f-wa').textContent = "WhatsApp Us";
        document.getElementById('f-wa').href = 'https://wa.me/' + clinicData.whatsapp.replace(/\\D/g,'');
        document.getElementById('f-email').textContent = clinicData.email;

        const today = new Date().toLocaleString("en-CA", {timeZone: "Asia/Kolkata"}).split(',')[0];
        document.getElementById('b-date').setAttribute('min', today);
    }

    function nextStep(step) {
        if(step === 2) {
            const name = document.getElementById('b-name').value;
            const phone = document.getElementById('b-phone').value;
            if(!name || !phone || phone.length < 10) return alert("Please enter valid name and mobile number.");
            bookingData.name = name; bookingData.phone = phone;
        }
        document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
        document.getElementById('step-' + step).classList.add('active');
        document.querySelectorAll('.step-indicator').forEach((el, i) => {
            if(i < step) el.classList.add('active'); else el.classList.remove('active');
        });
    }

    function prevStep(step) {
        document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
        document.getElementById('step-' + step).classList.add('active');
        document.querySelectorAll('.step-indicator').forEach((el, i) => {
            if(i < step) el.classList.add('active'); else el.classList.remove('active');
        });
    }

    async function fetchSlots() {
        const date = document.getElementById('b-date').value;
        const doctorId = document.getElementById('b-doctor').value;
        const container = document.getElementById('slot-container');
        document.getElementById('btn-to-3').disabled = true;
        bookingData.time = null;

        if(!date || !doctorId) return;

        const day = new Date(date).getDay();
        if(day === 0) {
            container.innerHTML = '<p style="color:var(--danger); grid-column:1/-1;">Clinic is closed on Sundays.</p>';
            return;
        }

        container.innerHTML = '<p style="grid-column:1/-1;">Checking availability...</p>';
        const res = await fetch(\`/api/availability?date=\${date}&doctorId=\${doctorId}\`);
        const data = await res.json();
        
        container.innerHTML = '';
        if(!data.availableSlots || data.availableSlots.length === 0) {
            container.innerHTML = '<p style="grid-column:1/-1;">No slots available for this date.</p>';
            return;
        }

        data.availableSlots.forEach(slot => {
            const btn = document.createElement('button');
            btn.className = 'time-slot';
            btn.textContent = slot;
            btn.onclick = () => {
                document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                bookingData.time = slot;
                document.getElementById('btn-to-3').disabled = false;
            };
            container.appendChild(btn);
        });
    }

    function selectPayment(method) {
        bookingData.paymentMethod = method;
        document.getElementById('pay-upi').classList.remove('selected');
        document.getElementById('pay-cash').classList.remove('selected');
        document.getElementById('pay-' + method).classList.add('selected');
        document.getElementById('btn-submit').disabled = false;
    }

    async function submitBooking() {
        const btn = document.getElementById('btn-submit');
        btn.textContent = "Processing..."; btn.disabled = true;

        const payload = {
            patientName: bookingData.name,
            patientPhone: bookingData.phone,
            doctorId: document.getElementById('b-doctor').value,
            serviceName: document.getElementById('b-service').value,
            appointmentDate: document.getElementById('b-date').value,
            appointmentTime: bookingData.time,
            paymentMethod: bookingData.paymentMethod
        };

        try {
            const res = await fetch('/api/appointments', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if(res.ok) {
                document.getElementById('res-ref').textContent = data.bookingReference;
                nextStep(4);
                
                if(bookingData.paymentMethod === 'upi') {
                    document.getElementById('upi-instructions').style.display = 'block';
                    document.getElementById('clinic-upi-id').textContent = clinicData.upiId;
                    
                    if(clinicData.qrUrl) {
                        const qrImg = document.getElementById('clinic-qr');
                        qrImg.src = clinicData.qrUrl;
                        qrImg.style.display = 'block';
                    }
                    
                    const upiUri = \`upi://pay?pa=\${clinicData.upiId}&pn=\${encodeURIComponent(clinicData.name)}&tr=\${data.bookingReference}&cu=INR\`;
                    document.getElementById('upi-link').href = upiUri;
                } else {
                    document.getElementById('cash-instructions').style.display = 'block';
                }
            } else {
                alert(data.error || "Failed to book. Please try again.");
                btn.textContent = "Confirm Booking"; btn.disabled = false;
            }
        } catch(e) {
            alert("Connection error. Please try again.");
            btn.textContent = "Confirm Booking"; btn.disabled = false;
        }
    }

    window.onload = init;
</script>
</body>
</html>`;
    res.send(html);
});

// ==========================================
// 6. SERVER INITIALIZATION
// ==========================================
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Dental Clinic Booking Server running on port ${PORT}`);
    });
}

module.exports = app;
