![Static Badge](https://img.shields.io/badge/Extension%20Manifest-v3-blue)
![Static Badge](https://img.shields.io/badge/Typescript-JS%20Doc-green)

# ani-auto-skip-extension 閉嘴動畫瘋

An extension to mute and wait for animation crazy's ADs  
再也不用看動畫瘋聽到詐騙廣告。

This extension will:  
這個擴充功能會：

- Click accept button on page load  
  自動點擊同意按鈕
- Mute the tab and show an unmute button on top of the page  
  靜音分頁並加上一個"取消靜音"的按鈕在網頁上方
- After 30 seconds, try click those skip ad buttons  
  三十秒後嘗試點擊跳過廣告的按鈕
- Restore the volume and stop video from playing  
  恢復頁面聲音並且暫停播放  

## Installation

Load unpack development package > choose this directory  
在開發者人員模式中載入未封裝的擴充功能

You can delete other files expect following:  
可以只留以下幾個文件：

- main.js
- manifest.json
- service_worker.js

## Support

No guarantee. Raise some issues and I will eventually see them, and probably ignore them.
