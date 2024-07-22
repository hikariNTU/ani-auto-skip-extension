![Static Badge](https://img.shields.io/badge/Extension%20Manifest-v3-blue)
![Static Badge](https://img.shields.io/badge/Typescript-JS%20Doc-green)

# ani-auto-skip-extension 閉嘴動畫瘋

![Ani Skip Icon](./banner.png)

An extension to mute and wait for animation crazy's ADs  
自動靜音並點及跳過廣告按鈕

## Description

This extension will:  
這個擴充功能會：

- Replace disagree Button with addon button
  更換『不同意』按鈕成『啟動自動跳過模式』按鈕
- Mute the tab and show an un-mute button on top of the page  
  靜音瀏覽器分頁並加上一個『取消靜音』的按鈕在網頁上方
- Try skip AD inside Google ADs  
  嘗試略過 Google AD 的廣告 (Skip AD)
- After 30 seconds, try click those skip ad buttons  
  三十秒後嘗試點擊跳過廣告的按鈕
- Restore the volume and stop video from playing  
  恢復頁面聲音並且暫停播放

## Installation

Load unpack development package > choose `/src` directory  
在開發者人員模式中載入未封裝的擴充功能，並選擇 `/src` 資料夾

## AD Skip Coverage

- [x] 基本款 無聲內嵌 AD
- [x] 滿版 Google AD, 右下角有五秒後才能跳過的透明黑色按鈕
- [x] 滿版 Google AD, 白色背景，右上角有 XX 秒後可獲得獎勵的按鈕，可以直接跳過
- [ ] 半版彈出式小型 Google AD (出現機率感人，可用的 selector 未知)

## Support

No guarantee. Raise some issues and I will eventually see them, and probably ignore them.
