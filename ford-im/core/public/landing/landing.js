// Landing de Vamo: el español va en el HTML; aquí sólo vive la traducción al inglés.
const EN = {
  'nav.how': 'How it works', 'nav.features': 'Features', 'nav.hardware': 'Hardware', 'nav.pricing': 'Pricing', 'nav.demo': 'Demo',
  'cta.demo': 'See the live demo', 'cta.contact': 'Get Vamo for my dealership', 'cta.quote': 'Request a quote', 'cta.kiosk': 'Open the demo kiosk',
  'hero.pill': 'For car dealerships in Mexico, LATAM and the US',
  'hero.title': 'No customer waits at your dealership again.',
  'hero.lead': 'Vamo puts a smart kiosk on your showroom floor. Customers scan a QR code, an AI advisor helps them instantly on WhatsApp, and they leave with a test drive booked, their identity verified and their credit application signed. You see it all in the CRM.',
  'hero.p1': 'From <b>$5,999 MXN</b>/month, hardware included',
  'hero.p2': 'DMS integration at <b>no cost</b>',
  'hero.p3': 'Immediate nationwide rollout',
  'chat.online': 'online',
  'chat.m1': 'Hi 👋 I want info on the Territory',
  'chat.m2': 'Hi! Here is a 30-second video 🎬 The hybrid starts at $569,900 MXN. Shall we book a test drive?',
  'chat.m3': 'Yes, Saturday. Can I finance it?',
  'chat.m4': '✅ Saturday 11:00 booked. For financing, verify your ID here (2 min) 🪪',
  'stats.s1': 'more likely to qualify a lead when you reply within 1 hour¹',
  'stats.s2': 'of new cars in Mexico are bought on credit²',
  'stats.s3': 'of internet users in Mexico use WhatsApp³',
  'stats.s4': 'wait time: the AI advisor answers instantly, 24/7',
  'how.eyebrow': 'How it works', 'how.title': 'From showroom to bank, paperless.',
  'how.s1t': 'Scan', 'how.s1d': 'The kiosk plays the car on video next to a QR code that changes every 30 seconds, so it can’t be reused outside the dealership.',
  'how.s2t': 'Chat', 'how.s2d': 'WhatsApp opens with the model and dealership already identified. The AI advisor answers by text or voice, in Spanish or English, with prices, trims and spec sheets.',
  'how.s3t': 'Drive & finance', 'how.s3d': 'Book the test drive, verify identity (national ID or passport + liveness check) and the bank application fills itself, ready to sign on the phone.',
  'how.s4t': 'Close', 'how.s4d': 'The file reaches the bank with the customer in copy. Your team sees every lead, conversation and funnel stage in real time.',
  'feat.eyebrow': 'Features', 'feat.title': 'Everything your dealership needs to never lose a lead.',
  'feat.f1t': 'Dynamic QR', 'feat.f1d': 'Changes every 30 s and carries model, dealership and kiosk. You know which screen and which car drove each sale.',
  'feat.f2t': 'AI advisor on WhatsApp', 'feat.f2d': 'Replies instantly, 24/7, with your catalog, prices and offers. Understands voice notes and hands off to a salesperson when needed.',
  'feat.f3t': 'Voice advisor at the kiosk', 'feat.f3d': 'Customers ask out loud in front of the screen and get a spoken answer, in Spanish or English.',
  'feat.f4t': 'Test drives', 'feat.f4d': 'Available slots per dealership, confirmation with location, calendar link and a reminder the day before.',
  'feat.f5t': 'KYC with liveness check', 'feat.f5d': 'Front and back of the national ID or a passport, selfie and motion challenges from the phone. The verified CURP pre-fills the application.',
  'feat.f6t': 'Multi-bank financing', 'feat.f6d': 'The customer picks a bank, the official form fills with their data and documents, and the file is emailed with the customer in copy.',
  'feat.f7t': 'E-signature', 'feat.f7d': 'Sign with DocuSign on the phone, no printing or scanning. The bank records its decision in a portal and the customer gets a WhatsApp update.',
  'feat.f8t': 'Live CRM & funnel', 'feat.f8d': 'Sales inbox, pipeline by stage, test-drive calendar and QR-to-approved-credit conversion by dealership and kiosk.',
  'feat.f9t': 'Privacy by design', 'feat.f9d': 'Privacy notices and express consent for credit under Mexico’s data-protection law (LFPDPPP), with every acceptance on record.',
  'dms.eyebrow': 'Integrations', 'dms.title': 'We connect your DMS at no cost.',
  'dms.lead': 'Our team integrates Vamo with the DMS you already use: inventory, prices and offers flow into the advisor, and leads, appointments and applications flow back into your system. No integration fee, no months-long project.',
  'dms.c1': 'Inventory and prices in sync', 'dms.c2': 'Leads and test drives back into your DMS or CRM', 'dms.c3': 'API and webhooks for anything else',
  'dms.chip': 'Your DMS', 'dms.banks': 'Banks & lenders', 'dms.crm': 'Your CRM',
  'hw.eyebrow': 'Hardware included', 'hw.title': 'Smart screens and kiosks, ready for your showroom.',
  'hw.lead': 'We rent the hardware, install it and monitor it remotely. If a screen goes offline, we know before you do.',
  'hw.h1t': 'Vertical touch totem', 'hw.h1d': 'For the entrance or next to the display car. Model video, QR and voice advisor.',
  'hw.h2t': 'Landscape screen', 'hw.h2d': 'For a wall or waiting area. Full-screen cinema mode with a floating QR.',
  'hw.h3t': 'Countertop kiosk', 'hw.h3d': 'For reception, service or events. Compact, with the same end-to-end journey.',
  'price.eyebrow': 'Pricing', 'price.title': 'One monthly rental. Everything included.',
  'price.lead': 'No upfront hardware investment and no integration fee. Start with one kiosk and grow to every dealership.',
  'price.deploy': 'Immediate nationwide rollout.',
  'price.from': 'Rental from', 'price.per': 'MXN / month', 'price.unit': 'per kiosk',
  'price.i1': 'Smart screen or kiosk, installation and support',
  'price.i2': 'AI advisor on WhatsApp and at the kiosk',
  'price.i3': 'Test drives, KYC, financing and e-signature',
  'price.i4': 'CRM with funnel, sales inbox and reports',
  'price.i5': 'DMS integration at no cost',
  'price.fine': 'Reference price in Mexico; the final plan depends on hardware and number of dealerships. In the US and LATAM we quote in local currency.',
  'demo.eyebrow': 'Live demo', 'demo.title': 'Try it yourself, right now.',
  'demo.lead': 'Demo environment set up for a dealership with the Ford Mexico lineup. CRM customers are fictitious and identity verification is simulated.',
  'demo.k': '📺 QR kiosk', 'demo.kd': 'Open it on a screen and scan the QR with your phone: the WhatsApp conversation is real.',
  'demo.f': '📊 CRM: sales funnel', 'demo.fd': 'Scans, conversations, KYC, signatures and approved loans. Read-only.',
  'demo.i': '💬 Sales inbox', 'demo.id': 'WhatsApp conversations, test-drive calendar and pipeline.',
  'demo.y': '🪪 KYC with liveness check', 'demo.yd': 'Open it on your phone: ID or passport capture, selfie and motion challenges.',
  'demo.c': '🏦 Filled credit form', 'demo.cd': 'Demo credit application with the customer’s data already filled in.',
  'demo.open': 'Open →', 'demo.pdf': 'View PDF →',
  'demo.l1': 'Blank credit form (PDF)', 'demo.l2': 'Sample spec sheet (PDF)', 'demo.l3': 'Terms and conditions', 'demo.l4': 'Privacy notices', 'demo.l5': 'All demo links',
  'faq.title': 'FAQ',
  'faq.q1': 'Do I need to change my DMS or CRM?', 'faq.a1': 'No. Vamo connects to what you already use, and the DMS integration is free.',
  'faq.q2': 'What if the customer wants to talk to a person?', 'faq.a2': 'The AI advisor hands the conversation to a salesperson in the inbox with full context. The salesperson can take it or hand it back to the bot.',
  'faq.q3': 'Does it work with any bank?', 'faq.a3': 'Yes. We load the form of every bank or lender you work with; the demo uses a sample BBVA application.',
  'faq.q4': 'How long does installation take?', 'faq.a4': 'Rollout is immediate nationwide: we bring the hardware, install it and set up your catalog and dealerships.',
  'faq.q5': 'Does it work for other brands?', 'faq.a5': 'Yes. Vamo works for any brand and dealer group; the demo is set up with the Ford Mexico lineup.',
  'final.title': 'Every minute a customer waits is a sale for the competition.',
  'foot.sources': '¹ Harvard Business Review, “The Short Life of Online Sales Leads” (2011). ² AMDA, first half of 2025. ³ Statista / Asociación de Internet MX. Ford and model names are trademarks of their respective owners and are used only in the demo environment.',
  'foot.privacy': 'Privacy notice',
};

const nodes = [...document.querySelectorAll('[data-i18n]')];
const ES = new Map(nodes.map((el) => [el, el.innerHTML]));

function setLang(lang) {
  document.documentElement.lang = lang;
  for (const el of nodes) el.innerHTML = lang === 'en' ? (EN[el.dataset.i18n] ?? ES.get(el)) : ES.get(el);
  document.querySelectorAll('.lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));
  try { localStorage.setItem('vamo-lang', lang); } catch { /* sin almacenamiento */ }
}

document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
let saved = null;
try { saved = localStorage.getItem('vamo-lang'); } catch { /* sin almacenamiento */ }
const initial = new URLSearchParams(location.search).get('lang') || saved || (navigator.language?.startsWith('es') ? 'es' : 'en');
if (initial === 'en') setLang('en');
document.getElementById('year').textContent = new Date().getFullYear();
