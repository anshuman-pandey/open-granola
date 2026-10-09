# Open Granola में योगदान

[English](../../CONTRIBUTING.md) · **हिन्दी** · [Español](CONTRIBUTING.es.md) · [अनुवाद गाइड](../I18N.md)

<!-- English source: CONTRIBUTING.md at 6127b7f34b2e3ea786481953cfe57a7179a214c6; reviewed 2026-10-10. -->

स्थानीय प्रोसेसिंग को डिफ़ॉल्ट रखें और हर वैकल्पिक रिमोट गंतव्य को स्पष्ट करें। सुविधाओं की सीमाएँ साफ़ लिखी होनी चाहिए। मॉडल, अनुमति या प्लेटफ़ॉर्म सुविधा उपलब्ध न हो, तो विफलता उपयोगकर्ता को दिखाई देनी चाहिए।

## साथ जुड़ें

बग रिपोर्ट, दस्तावेज़ सुधार, accessibility सुधार और कोड योगदान का स्वागत है। नई रिपोर्ट से पहले मौजूदा issues देखें। बड़े बदलाव के लिए पहले issue में समस्या और दायरा बताएँ, ताकि योगदानकर्ता उस पर चर्चा कर सकें। निजी रूप से सुरक्षा समस्या बताने के लिए [SECURITY.md](../../SECURITY.md) देखें।

रिपॉज़िटरी fork करें, अपने बदलाव के लिए branch बनाएँ और `main` के विरुद्ध pull request खोलें। बदलाव का छोटा विवरण और चलाई गई जाँच शामिल करें। केवल दस्तावेज़ के छोटे बदलावों के लिए नेटिव toolchain ज़रूरी नहीं है।

इंटीग्रेशन पर केंद्रित योगदान के लिए [समुदाय योगदान योजना](../COMMUNITY_GROWTH.md) देखें।

## सेटअप

Node 24 LTS और Rust 1.98 या नया उपयोग करें। नेटिव बिल्ड के लिए CMake, libclang, C/C++ कंपाइलर और [Tauri की प्लेटफ़ॉर्म dependencies](https://v2.tauri.app/start/prerequisites/) भी चाहिए।

```sh
npm ci
npm run dev          # ब्राउज़र में नमूना वर्कस्पेस
npm run tauri dev    # नेटिव ऐप; Settings में दी गई डायरेक्टरी में मॉडल हाथ से इंस्टॉल करें
```

मॉडल फ़ाइलों के नाम और समर्थित व्यवहार के लिए [README](README.hi.md) देखें।

## इंजीनियरिंग नियम

1. रनटाइम नेटवर्किंग केवल समीक्षा किए गए नेटिव `providers.rs` और `auth.rs` मॉड्यूल में होनी चाहिए। एंडपॉइंट validation, डिवाइस से बाहर टेक्स्ट भेजने की अनुमति, redirect/proxy रोकना, सीमित response आकार और credentials को अलग रखने के नियम सुरक्षित रखें। Renderer की CSP को ऐप IPC तक सीमित रखें। Analytics, छिपे हुए upload, remote assets या बिना बताए cloud fallback न जोड़ें। किसी भी नए गंतव्य के लिए स्पष्ट उत्पाद और सुरक्षा समीक्षा आवश्यक है।
2. डेटा वाली हर तालिका retention और पूरी लाइब्रेरी मिटाने की प्रक्रिया में शामिल होनी चाहिए। Schema, migration, FTS और deletion में बदलाव के लिए regression tests जोड़ें। SSD या backups से भौतिक रूप से डेटा मिटने का वादा न करें।
3. नोट्स बेहतर बनाने से पहले मूल ट्रांसक्रिप्ट सहेजें। कई तालिकाओं में लिखते समय transactions उपयोग करें। Renderer से आए timestamps, मॉडल के output structure या इंपोर्ट किए गए JSON पर भरोसा न करें।
4. त्रुटियाँ दिखाएँ और दोबारा कोशिश करने के रास्ते बनाए रखें। नमूना डेटा, पहले से तय जवाब या स्थिर network counters को असली डेस्कटॉप परिणाम की तरह न दिखाएँ।
5. भारी inference और ऑडियो का काम UI thread से बाहर रखें। Capture, retention या deletion बदलते समय capture gate का सम्मान करें।

## जमा करने से पहले

```sh
npm run check
npm audit
npm run build:worker
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --workspace --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace
```

दोनों dependency lockfiles commit करें। Pull request में व्यवहार, validation और प्लेटफ़ॉर्म की बची हुई सीमाएँ बताएँ। Conventional commit messages उपयोग करें और संबंधित बदलाव साथ रखें। मीटिंग लाइब्रेरी, ऑडियो, model weights, credentials या signing keys कभी commit न करें।

## उपयोगी अगला काम

- हर OS पर नेटिव सिस्टम ऑडियो loopback लागू करना और जाँचना।
- कैप्चर के दौरान प्रक्रिया बंद हो जाने पर checkpoint से रिकवरी जोड़ना।
- वास्तविक मॉडल के साथ लंबी मीटिंग का ट्रांसक्रिप्शन और सारांश सत्यापित करना।
- लाइब्रेरी pagination और लंबे ट्रांसक्रिप्ट के rendering benchmarks जोड़ना।
- वास्तविक हार्डवेयर पर मॉडल संगतता, accessibility और पैकेज किए ऐप की permissions जाँचना।

सुरक्षा समस्याएँ [SECURITY.md](../../SECURITY.md) के अनुसार बताएँ। विनम्र और स्पष्ट रहें। योगदान Apache-2.0 के अंतर्गत लाइसेंस किए जाते हैं।
