// Apply the theme before the first paint, so there is no flash.
try { const t = localStorage.getItem('itk.theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
