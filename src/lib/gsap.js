// 所有動畫都從這裡拿 gsap。
//
// 原本註冊 useGSAP 的動作放在 main.jsx，等於把整包 gsap（約 70 kB）綁在首包上，
// 但真正用到動畫的全是 lazy 載入的頁面/元件。改由這個模組負責註冊之後，
// gsap 會跟著第一個需要它的分包一起下載，首屏不必為它付費；
// 註冊本身是冪等的，也保證不論哪個路由先載入都已經完成註冊。
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export { gsap, useGSAP };
export default gsap;
