# GeoAI Studio - Bilgi Notu

## Uygulama Nedir?

GeoAI Studio, Esri ArcGIS Maps SDK tabanlı, Türkçe arayüze sahip bir **coğrafi yapay zeka asistanı** web uygulamasıdır. Kullanıcılar hem doğal dilde coğrafi sorular sorabilir hem de kendi yükledikleri GIS verileri (GDB dosyaları) üzerinde konumsal analiz yaptırabilir. Ekran iki ana bölümden oluşur: solda/sağda etkileşimli harita, diğer tarafta soru-cevap yapabildiğiniz "GeoAI Asistan" paneli.

## Kimin İçin?

Elinde coğrafi veri (bina, parsel, yol, su hattı vb. içeren bir File Geodatabase - GDB) olan ve bu veriyi haritada görselleştirip, kod yazmadan/SQL bilmeden doğal dilde ("Building katmanında type değeri residential olanları listele", "okullara 500 metre mesafedeki parselleri bul" gibi) sorgulayabilmek isteyen kullanıcılar (GIS uzmanı olmayanlar dahil) için tasarlanmıştır.

## Temel Özellikler

1. **Genel coğrafya soruları** - "Türkiye'nin en yüksek dağı nedir?" gibi sorulara yerel bilgi tabanından veya AI'dan cevap verir, ilgili konumu haritada gösterir.
2. **Yer gösterme / arama** - "Ankara'yı haritada göster" gibi komutlarla Esri World Geocoding servisi üzerinden yer bulur, zoom yapar, işaretler.
3. **Rota oluşturma** - İki nokta arasında Esri Routing Service ile rota çizer, mesafe/süre bilgisi verir.
4. **GDB veri yükleme ve analiz** - Kullanıcı bir GDB ZIP dosyası yükler; katmanlar PostGIS'e aktarılır ve haritada gösterilir.
5. **Doğal dilde veri sorgulama (Query Planner)** - Yüklenen veri hakkında serbest metinle soru sorulduğunda:
   - Yapay zeka, soruyu güvenli bir **SQL sorgusu** veya **konumsal analiz planına** (buffer/tampon, en yakın nokta, kesişim, belirli mesafe içi arama, poligona göre özetleme) çevirir.
   - Çalıştırmadan önce kullanıcıya bir **önizleme kartı** gösterilir (hangi katman, hangi filtre, tahmini kayıt sayısı, güvenlik durumu).
   - Kullanıcı "Çalıştır" derse sorgu PostGIS üzerinde çalışır, sonuçlar haritada vurgulanır ve bir sonuç tablosu panelinde listelenir.
6. **Katman yönetimi** - Yüklenen katmanların ve analiz sonuçlarının haritada ayrı ayrı gösterilip gizlenebilmesi.
7. **Çoklu dil** - Arayüz Türkçe ve İngilizce olarak kullanılabilir.

## Nasıl Çalışır (Mimari Özet)

- **Frontend**: React + Vite, ArcGIS Maps SDK for JavaScript ile harita render edilir.
- **Backend**: Node.js + Express; gelen soruları yönlendirir, AI sağlayıcısıyla (OpenAI uyumlu API / Ollama) konuşur.
- **Veritabanı**: PostgreSQL + PostGIS; yüklenen GDB katmanları buraya aktarılır, konumsal sorgular burada çalışır.
- **Güvenlik katmanı**: Yapay zekanın ürettiği SQL/analiz planı çalıştırılmadan önce sunucu tarafında doğrulanır - sadece `SELECT` sorgularına izin verilir, yalnızca o veri setine ait tablo/kolonlar kullanılabilir, tehlikeli komutlar (DROP, DELETE, yorum satırı, alt sorgu vb.) engellenir, sorgular salt-okunur bir transaction içinde ve zaman aşımı sınırıyla çalıştırılır. Ayrıca önizlenen plan, sunucuda tek kullanımlık bir token ile saklanır; yalnızca gerçekten önizlenen plan çalıştırılabilir.

## Örnek Kullanım Senaryosu

1. Kullanıcı bir GDB ZIP dosyası yükler (örn. bina, yol, su hattı katmanları içeren bir OpenStreetMap çıktısı).
2. "Building katmanında name sütununda YHT ifadesi geçen veriye en yakın building katmanındaki veriyi bul" yazar.
3. Asistan bunu bir "nearest_feature" analiz planına çevirir, önizleme kartında hangi katmanların kullanılacağını ve tahmini sonuç sayısını gösterir.
4. Kullanıcı "Çalıştır" butonuna basar, sonuç haritada vurgulanır ve panelde listelenir.
