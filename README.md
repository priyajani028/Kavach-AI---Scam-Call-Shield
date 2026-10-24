# 🛡️ Kavach AI — Google Scam Call Shield (ગુજરાતી • हिंदी • English)

**Understand, converse, and take action by voice.**  
Built 100% with **Google Technologies** (`Gemini 2.5 Flash Native Audio Understanding`, `Gemini 2.5 Flash Preview TTS`, `Material Design 3`, and `Firebase Hosting`).

---

## 🚨 The Problem
"Digital arrest", fake bank KYC, and fake narcotics parcel calls cost Indians thousands of crores every year. Elders and first-time smartphone users are hit hardest because scammers isolate them on the call (*"Do not disconnect the phone"*).

## ✨ What Kavach AI Does
1. **Mid-Call Chunked Audio Processing (`audio/wav`):** Slices ongoing phone calls into ~3.5-second `.wav` chunks using the Web Audio API (`sliceAudioBufferToWavBase64`) and streams them to **Gemini 2.5 Flash Native Audio Understanding** (`gemini-2.5-flash`) **while the call is still going**.
2. **Spoken Warning in Simple Gujarati (`ગુજરાતી`) or Hindi (`हिंदी`):** The moment scam red flags are detected mid-call (~6.5 seconds in), Kavach AI automatically ducks (lowers) the scammer's volume to 15% and speaks a comforting, clear warning aloud in Gujarati or Hindi.
3. **Names Exact Red Flags Heard:**
   - 🚓 **Authority Impersonation:** Claims to be Mumbai Police Cyber Cell or Bank KYC Team
   - ⚠️ **Threats:** Threatens "Digital Arrest", drugs in Aadhaar parcel, or account block
   - ⏳ **Urgency / Isolation:** Orders the victim not to cut the call (*"ફોન કાપશો નહીં"* / *"कॉल मत काटिए"*)
   - 💰 **Financial / OTP Demand:** Demands ₹50,000 transfer or SMS OTP
4. **Does Not Cry Wolf on Genuine Calls:** Includes genuine Swiggy delivery (`en_genuine_swiggy.wav`) and Gujarati Amul Dairy parcel (`gu_genuine_dairy.wav`) recordings that pass with `SAFE (4% Risk)`—even when the word *"પાર્સલ" (parcel)* is used in an everyday context.
5. **Emergency Family Contact Loop:** Automatically dispatches an alert to the elder's saved emergency contact (*"Your father may be on a scam call right now. Please call him."*).

---

## 📂 Pre-Recorded `.wav` Call Files Included (`/public/audio/`)
| File | Language | Type | Script Summary |
| :--- | :--- | :--- | :--- |
| `gu_scam_digital_arrest.wav` | **Gujarati (`ગુજરાતી`)** | 🔴 Scam | Mumbai Police Cyber Cell + Drugs in Aadhaar parcel + Digital Arrest + ₹50,000 demand |
| `hi_scam_digital_arrest.wav` | **Hindi (`हिंदी`)** | 🔴 Scam | Mumbai Police Cyber Cell + Drugs in Aadhaar parcel + Digital Arrest + ₹50,000 demand |
| `en_scam_bank_kyc.wav` | **English** | 🔴 Scam | Bank KYC expiry threat + immediate account block + OTP request |
| `en_genuine_swiggy.wav` | **English** | 🟢 Genuine | Swiggy delivery partner outside building asking which gate to come to |
| `gu_genuine_dairy.wav` | **Gujarati (`ગુજરાતી`)** | 🟢 Genuine | Amul Dairy shopkeeper informing milk/curd parcel is at society gate |

---

## 🚀 Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Add your free Google AI Studio Gemini API Key
# You can also paste it directly in the top-right "Add Gemini API Key" button in the UI!
export VITE_GEMINI_API_KEY="your_google_ai_studio_key"

# 3. Start the server
npm run dev
```
Open **http://localhost:5173** in your browser.

## Screenshots

### Dark Mode

<img width="3000" height="1658" alt="image" src="https://github.com/user-attachments/assets/e2727b9c-bb42-4ddb-b552-7c1ac4dce213" />

---

<img width="3002" height="1630" alt="image" src="https://github.com/user-attachments/assets/85de5225-b5c3-4971-9beb-ff67cd0bd4fd" />

---

<img width="2998" height="1666" alt="image" src="https://github.com/user-attachments/assets/43fb0b3a-2deb-475e-8c42-e6eab4cc3168" />

---

<img width="3002" height="1644" alt="image" src="https://github.com/user-attachments/assets/0b14dbb0-7a3d-4980-b8af-941066dd857a" />

---

<img width="3010" height="1630" alt="image" src="https://github.com/user-attachments/assets/1f480d7e-238e-49c3-a418-4eb4521a76f1" />

### Light Mode
<img width="3018" height="1814" alt="image" src="https://github.com/user-attachments/assets/66fca821-6387-416e-8342-0c1f118a5145" />

---

<img width="3012" height="1656" alt="image" src="https://github.com/user-attachments/assets/8241e334-2f27-4538-ace1-8bfc0f143ee8" />
