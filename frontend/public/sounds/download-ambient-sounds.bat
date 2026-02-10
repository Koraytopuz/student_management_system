@echo off
echo Ambient ses dosyalari indiriliyor...
cd /d "%~dp0"

curl -L -o rain.mp3 "https://www.orangefreesounds.com/wp-content/uploads/2014/10/Free-rain-sounds.mp3"
curl -L -o lofi.mp3 "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
curl -L -o cafe.mp3 "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3"

echo Tamamlandi. rain.mp3, cafe.mp3, lofi.mp3 olusturuldu.
pause
