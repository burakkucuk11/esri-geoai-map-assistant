# Proje: Esri Tabanlı GeoAI Web Uygulaması

## Amaç

Bu proje, Esri servislerini kullanan harita tabanlı bir GeoAI web uygulamasıdır.

Uygulama hem interaktif harita işlemleri yapacak hem de kullanıcıların doğal dilde sorduğu coğrafi sorulara cevap verecektir.

Örnek kullanıcı soruları:

* “Türkiye’nin en yüksek dağı nedir?”
* “Ankara’yı haritada göster.”
* “İstanbul’daki hastaneleri göster.”
* “Seçtiğim noktaya en yakın hizmet noktasını bul.”
* “Bu konuma rota oluştur.”
* “Türkiye’nin en büyük gölü nedir?”
* “Ağrı Dağı nerede?”

Uygulama Türkçe arayüze sahip olacaktır.

---

## Teknoloji Tercihi

Frontend:

* Vite
* React
* JavaScript veya TypeScript
* ArcGIS Maps SDK for JavaScript
* `@arcgis/core`

Backend:

* Node.js
* Express.js

AI / GeoAI Katmanı:

* İlk aşamada basit intent detection ve sabit coğrafi bilgi cevapları kullanılabilir.
* Daha sonra OpenAI API veya başka bir LLM servisi backend üzerinden entegre edilebilir.
* API key frontend içinde açık şekilde tutulmamalıdır.

Harita Servisleri:

* Esri ArcGIS Maps SDK for JavaScript
* Esri World Geocoding Service
* Esri Routing Service
* Esri Basemap servisleri
* Gerekirse ArcGIS Feature Service katmanları

---

## Uygulama Genel Yapısı

Ekran iki ana bölümden oluşmalıdır:

1. Harita Alanı
2. GeoAI Asistan Paneli

Harita alanında:

* Esri MapView kullanılmalı.
* Başlangıç konumu Türkiye olacak.
* Varsayılan basemap olarak `streets-vector` veya `topo-vector` kullanılmalı.
* Grafik katmanı oluşturulmalı.
* Arama sonucunda bulunan yerler haritada işaretlenmeli.
* Rota çizimi için ayrı bir grafik katmanı kullanılmalı.

GeoAI panelinde:

* Kullanıcı soru yazabilmeli.
* Gönder butonu olmalı.
* AI cevabı panelde görünmeli.
* Eğer soru harita ile ilgiliyse harita da tepki vermeli.
* Eğer soru genel coğrafya bilgisi ise metinsel cevap dönmeli.

---

## Kullanıcı Soru Tipleri

Uygulama kullanıcı sorularını aşağıdaki türlere ayırmalıdır:

### 1. Genel coğrafya sorusu

Örnekler:

* “Türkiye’nin en yüksek dağı nedir?”
* “Türkiye’nin en büyük gölü nedir?”
* “Türkiye’nin en uzun nehri nedir?”
* “Ankara hangi bölgede?”
* “Ağrı Dağı kaç metredir?”

Bu sorular harita komutu değilse, uygulama metinsel cevap vermelidir.

Örnek cevap:

> Türkiye’nin en yüksek dağı Ağrı Dağı’dır. Yaklaşık 5.137 metre yüksekliğindedir ve Doğu Anadolu Bölgesi’nde yer alır.

İlk aşamada aşağıdaki örnek bilgi tabanı kullanılabilir:

```js
const geoKnowledgeBase = [
  {
    keywords: ["türkiye", "en yüksek dağ", "yüksek dağı", "ağrı dağı"],
    answer: "Türkiye’nin en yüksek dağı Ağrı Dağı’dır. Yaklaşık 5.137 metre yüksekliğindedir ve Doğu Anadolu Bölgesi’nde yer alır.",
    location: {
      name: "Ağrı Dağı",
      longitude: 44.292,
      latitude: 39.702
    }
  },
  {
    keywords: ["türkiye", "en büyük göl", "van gölü"],
    answer: "Türkiye’nin en büyük gölü Van Gölü’dür. Doğu Anadolu Bölgesi’nde, Van ve Bitlis illeri arasında yer alır.",
    location: {
      name: "Van Gölü",
      longitude: 42.958,
      latitude: 38.640
    }
  },
  {
    keywords: ["türkiye", "en uzun nehir", "kızılırmak"],
    answer: "Türkiye sınırları içindeki en uzun nehir Kızılırmak’tır. Yaklaşık 1.355 kilometre uzunluğundadır.",
    location: {
      name: "Kızılırmak",
      longitude: 35.0,
      latitude: 39.5
    }
  },
  {
    keywords: ["başkent", "türkiye", "ankara"],
    answer: "Türkiye’nin başkenti Ankara’dır. İç Anadolu Bölgesi’nde yer alır.",
    location: {
      name: "Ankara",
      longitude: 32.8597,
      latitude: 39.9334
    }
  }
];
```

Eğer bilginin `location` değeri varsa, cevap verildikten sonra ilgili konum haritada gösterilmelidir.

---

### 2. Haritada yer gösterme komutu

Örnekler:

* “Ankara’yı göster”
* “Ağrı Dağı nerede?”
* “İstanbul’u haritada aç”
* “Van Gölü’nü göster”

Bu durumda Esri World Geocoding Service kullanılmalıdır.

Akış:

1. Kullanıcı sorusu analiz edilir.
2. Yer adı çıkarılır.
3. Esri geocoding servisine gönderilir.
4. Sonuç bulunursa harita o konuma zoom yapar.
5. Konuma marker eklenir.
6. Panelde kısa bilgi verilir.

Örnek cevap:

> Ankara haritada gösterildi.

---

### 3. Yakınlık analizi

Örnekler:

* “Bana en yakın hastaneyi bul”
* “Bu noktaya en yakın okul nerede?”
* “Haritadaki seçtiğim noktaya en yakın eczaneyi bul”

Bu özellik için ilk aşamada örnek FeatureLayer veya mock veri kullanılabilir.

Geliştirme mantığı:

* Kullanıcının seçtiği nokta alınır.
* İlgili hizmet noktaları katmanı sorgulanır.
* Mesafe hesaplanır.
* En yakın nokta bulunur.
* Haritada highlight edilir.
* Panelde adı ve mesafesi yazılır.

---

### 4. Rota oluşturma

Örnekler:

* “Ankara’dan İstanbul’a rota çiz”
* “Bulunduğum konumdan en yakın hastaneye rota oluştur”
* “Seçili noktaya yol tarifi ver”

Bu özellikte Esri Routing Service kullanılmalıdır.

Akış:

1. Başlangıç ve bitiş noktası belirlenir.
2. Esri Route servisine istek atılır.
3. Dönen rota geometry haritada çizilir.
4. Mesafe ve süre panelde gösterilir.

---

## Intent Detection Mantığı

Kullanıcının yazdığı soru küçük harfe çevrilmeli ve Türkçe karakterleri desteklemelidir.

Basit örnek intent sistemi:

```js
function detectIntent(userText) {
  const text = userText.toLowerCase();

  if (
    text.includes("en yüksek") ||
    text.includes("en büyük") ||
    text.includes("en uzun") ||
    text.includes("nedir") ||
    text.includes("kaç metre") ||
    text.includes("hangi bölgede")
  ) {
    return "general_geo_question";
  }

  if (
    text.includes("göster") ||
    text.includes("haritada") ||
    text.includes("nerede") ||
    text.includes("konum")
  ) {
    return "show_location";
  }

  if (
    text.includes("en yakın") ||
    text.includes("yakınımdaki") ||
    text.includes("yakın")
  ) {
    return "nearest_analysis";
  }

  if (
    text.includes("rota") ||
    text.includes("yol tarifi") ||
    text.includes("nasıl giderim")
  ) {
    return "route";
  }

  return "unknown";
}
```

---

## GeoAI Cevap Mantığı

Kullanıcı soru gönderdiğinde şu akış çalışmalıdır:

```js
async function handleGeoAIQuestion(userText) {
  const intent = detectIntent(userText);

  if (intent === "general_geo_question") {
    return answerFromGeoKnowledgeBase(userText);
  }

  if (intent === "show_location") {
    return showLocationOnMap(userText);
  }

  if (intent === "nearest_analysis") {
    return findNearestFeature(userText);
  }

  if (intent === "route") {
    return createRouteFromQuestion(userText);
  }

  return {
    type: "text",
    answer: "Bu soruyu şu anda tam anlayamadım. Haritada bir yer göstermemi, rota oluşturmamı veya coğrafi bir bilgi sormanı deneyebilirsin."
  };
}
```

---

## Genel Coğrafya Bilgi Fonksiyonu

```js
function answerFromGeoKnowledgeBase(userText) {
  const text = userText.toLowerCase();

  const matchedItem = geoKnowledgeBase.find(item =>
    item.keywords.some(keyword => text.includes(keyword.toLowerCase()))
  );

  if (!matchedItem) {
    return {
      type: "text",
      answer: "Bu coğrafi soruya şu anda yerel bilgi tabanımda cevap bulamadım. İlerleyen aşamada bu cevaplar LLM API üzerinden genişletilebilir."
    };
  }

  return {
    type: "geo_answer",
    answer: matchedItem.answer,
    location: matchedItem.location || null
  };
}
```

Eğer `location` varsa, uygulama otomatik olarak o noktaya zoom yapmalı ve marker eklemelidir.

---

## Harita Davranışı

Genel coğrafi soruya cevap verildiğinde eğer konum bilgisi varsa:

Örnek soru:

> Türkiye’nin en yüksek dağı nedir?

Beklenen davranış:

1. Panelde cevap yazmalı:

   > Türkiye’nin en yüksek dağı Ağrı Dağı’dır. Yaklaşık 5.137 metre yüksekliğindedir ve Doğu Anadolu Bölgesi’nde yer alır.

2. Harita Ağrı Dağı konumuna zoom yapmalı.

3. Ağrı Dağı üzerine marker eklenmeli.

4. Popup içinde şu bilgiler yazmalı:

   * Ad: Ağrı Dağı
   * Açıklama: Türkiye’nin en yüksek dağı
   * Yükseklik: Yaklaşık 5.137 m

---

## UI Gereksinimleri

Arayüz modern ve temiz olmalıdır.

Sol veya sağ tarafta GeoAI paneli bulunmalıdır.

Panel içeriği:

* Başlık: GeoAI Asistan
* Açıklama: “Esri servisleriyle çalışan coğrafi asistan”
* Soru input alanı
* Gönder butonu
* Cevap geçmişi
* Örnek soru butonları

Örnek soru butonları:

* Türkiye’nin en yüksek dağı nedir?
* Ankara’yı haritada göster
* Van Gölü nerede?
* Türkiye’nin en uzun nehri nedir?
* İstanbul’a zoom yap

Harita tam ekran gibi geniş görünmelidir.

Mobil uyumlu tasarım yapılmalıdır.

---

## Dosya Yapısı

Önerilen dosya yapısı:

```txt
geoai-esri-app/
├── package.json
├── vite.config.js
├── .env.example
├── index.html
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── styles.css
│   ├── data/
│   │   └── geoKnowledgeBase.js
│   ├── utils/
│   │   ├── intentDetector.js
│   │   ├── geoAIEngine.js
│   │   ├── geocoder.js
│   │   └── routeService.js
│   └── components/
│       ├── MapView.jsx
│       └── GeoAIPanel.jsx
└── server/
    ├── index.js
    └── aiService.js
```

---

## Environment Dosyası

`.env.example` dosyası oluştur:

```env
VITE_ARCGIS_API_KEY=your_esri_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

Not:

* Esri API key frontend tarafında sadece harita servisleri için kullanılabilir.
* OpenAI API key kesinlikle frontend içinde kullanılmamalıdır.
* AI API çağrıları backend üzerinden yapılmalıdır.

---

## İlk Versiyon İçin Öncelikler

İlk çalışan sürümde mutlaka şunlar olsun:

1. React + Vite projesi çalışsın.
2. Esri haritası açılsın.
3. Türkiye başlangıç görünümü gelsin.
4. GeoAI paneli olsun.
5. Kullanıcı soru sorabilsin.
6. “Türkiye’nin en yüksek dağı nedir?” sorusuna cevap versin.
7. Cevap verirken Ağrı Dağı’nı haritada göstersin.
8. “Ankara’yı haritada göster” komutu Esri geocoder ile çalışsın.
9. Marker ve popup oluşsun.
10. Kod modüler ve anlaşılır olsun.

---

## Demo Senaryo

Kullanıcı:

> Türkiye’nin en yüksek dağı nedir?

Uygulama cevabı:

> Türkiye’nin en yüksek dağı Ağrı Dağı’dır. Yaklaşık 5.137 metre yüksekliğindedir ve Doğu Anadolu Bölgesi’nde yer alır.

Harita:

* Ağrı Dağı’na zoom yapar.
* Marker ekler.
* Popup açar.

Kullanıcı:

> Ankara’yı haritada göster

Uygulama:

* Esri World Geocoding Service ile Ankara’yı bulur.
* Haritada Ankara’ya zoom yapar.
* Marker ekler.
* “Ankara haritada gösterildi.” cevabını verir.

---

## Kodlama Talimatı

Bu projeyi sıfırdan oluştur.

Önce çalışan minimum versiyonu yap.

Kodları gereksiz karmaşıklaştırma.

Öncelik çalışan ürün olsun.

Harita ve GeoAI paneli aynı ekranda görünmeli.

ArcGIS Maps SDK for JavaScript doğru şekilde kurulmalı.

Gerekli paketleri package.json içine ekle.

Uygulamayı `npm install` ve `npm run dev` ile çalışacak hale getir.

Kod içinde açıklayıcı yorumlar ekle.

Türkçe arayüz kullan.

Hatalı veya eksik API key durumunda kullanıcıya anlaşılır hata göster.

İlk sürümde mock bilgi tabanı kullanılabilir, ancak yapı ileride gerçek LLM API’ye bağlanabilecek şekilde hazırlanmalıdır.

---

## Beklenen Çıktı

Codex şu çıktıları üretmelidir:

* Tam çalışan React + Vite uygulaması
* Esri MapView entegrasyonu
* GeoAI soru-cevap paneli
* Basit intent detection
* Coğrafi bilgi tabanı
* Haritada konum gösterme
* Marker/popup sistemi
* Temiz CSS
* README.md
* `.env.example`
