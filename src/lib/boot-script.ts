// Inline script for <head>, run before the body paints:
//  - applies the saved appearance (html.dark) so dark mode never flashes white;
//  - catches the one-time `beforeinstallprompt` event before React hydrates
//    (picked up by startPwa in src/lib/pwa.ts).
export const BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem('sccs-theme');var d=p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d)r.classList.add('dark');r.style.colorScheme=d?'dark':'light';}catch(e){}window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__sccsInstallEvent=e;});})();`;
