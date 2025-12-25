/*
  Dynamic travel gallery utilities for GitHub Pages
  - Lists folders and media using GitHub REST API
  - Renders responsive gallery grid for images/videos
*/
(function () {
  const OWNER = 'lulukef';
  const REPO = 'lulukef.github.io';
  const BRANCH = 'main';
  const BASE = 'img/travel';
  const API = (path) => `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`;

  const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const HEIC_EXT = ['.heic'];
  const VIDEO_EXT = ['.mp4', '.webm', '.mov'];
  const MAX_DIM = 1600; // max width/height for displayed images
  const urlCache = new Map(); // cache of object URLs

  function isImage(name) {
    const n = name.toLowerCase();
    return IMAGE_EXT.some((e) => n.endsWith(e));
  }
  function isHeic(name) {
    const n = name.toLowerCase();
    return HEIC_EXT.some((e) => n.endsWith(e));
  }
  function isVideo(name) {
    const n = name.toLowerCase();
    return VIDEO_EXT.some((e) => n.endsWith(e));
  }
  function toTitle(slug) {
    return slug
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  async function fetchJson(url) {
    const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
    if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
    return res.json();
  }

  async function fetchBlob(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch error ${res.status}`);
    return res.blob();
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function ensureHeicLib() {
    if (window.heic2any) return;
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/heic2any@0.0.3/dist/heic2any.min.js');
  }

  function blobToImage(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }

  async function resizeToPng(blob, maxDim = MAX_DIM) {
    const img = await blobToImage(blob);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b || blob), 'image/png'));
  }

  async function buildDisplayUrl(pathRelative) {
    // Return cached object URL if present
    if (urlCache.has(pathRelative)) return urlCache.get(pathRelative);
    const lower = pathRelative.toLowerCase();
    const absolute = `/${pathRelative}`; // site-relative
    try {
      if (HEIC_EXT.some(e => lower.endsWith(e))) {
        await ensureHeicLib();
        const heicBlob = await fetchBlob(absolute);
        const pngBlob = await window.heic2any({ blob: heicBlob, toType: 'image/png' });
        const resized = await resizeToPng(pngBlob, MAX_DIM);
        const url = URL.createObjectURL(resized);
        urlCache.set(pathRelative, url);
        return url;
      } else if (IMAGE_EXT.some(e => lower.endsWith(e))) {
        // For large images, downscale to PNG for consistent display
        const imgBlob = await fetchBlob(absolute);
        const resized = await resizeToPng(imgBlob, MAX_DIM);
        const url = URL.createObjectURL(resized);
        urlCache.set(pathRelative, url);
        return url;
      }
    } catch (e) {
      console.warn('display URL processing failed, falling back to original', pathRelative, e);
    }
    return absolute; // fallback to original
  }

  async function listFolder(path) {
    try {
      return await fetchJson(API(path));
    } catch (err) {
      console.error('Failed to list folder', path, err);
      return [];
    }
  }

  async function renderAlbumGallery(containerSelector, albumSlug) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const path = `${BASE}/${albumSlug}`;
    
    // Try to get files from API first
    let items = await listFolder(path);
    let media = [];
    
    if (Array.isArray(items) && items.length > 0) {
      media = items.filter(i => i.type === 'file' && (isImage(i.name) || isHeic(i.name) || isVideo(i.name)));
    }
    
    // If API failed or returned no media, use fallback list
    if (media.length === 0 && FALLBACK_FILES[albumSlug]) {
      console.log('Using fallback file list for', albumSlug);
      media = FALLBACK_FILES[albumSlug].map(name => ({ name, type: 'file' }));
    }
    
    if (media.length === 0) {
      container.innerHTML = `<div class="text-center link-muted">No media found yet. Drop images/videos in <code>${path}</code>.</div>`;
      return;
    }
    
    const grid = document.createElement('div');
    grid.className = 'gallery-grid';

    media.forEach(async file => {
      const relPath = `${path}/${file.name}`;
      const item = document.createElement('div');
      item.className = 'gallery-item';
      if (isImage(file.name) || isHeic(file.name)) {
        // Prefer GitHub raw download URL for binary fetch reliability
        const srcForFetch = file.download_url || `/${relPath}`;
        let displayUrl;
        if (isHeic(file.name)) {
          // Convert HEIC to PNG then resize
          await ensureHeicLib();
          try {
            const heicBlob = await fetchBlob(srcForFetch);
            const pngBlob = await window.heic2any({ blob: heicBlob, toType: 'image/png' });
            const resized = await resizeToPng(pngBlob, MAX_DIM);
            displayUrl = URL.createObjectURL(resized);
          } catch (e) {
            console.warn('HEIC conversion failed; skipping', file.name, e);
          }
        } else {
          try {
            const imgBlob = await fetchBlob(srcForFetch);
            const resized = await resizeToPng(imgBlob, MAX_DIM);
            displayUrl = URL.createObjectURL(resized);
          } catch (e) {
            console.warn('Image resize failed; using original path', file.name, e);
            displayUrl = `/${relPath}`;
          }
        }
        // Wrap in clickable anchor for lightbox
        item.innerHTML = `<a href="${displayUrl}" class="lightbox-link"><img src="${displayUrl}" alt="${file.name}" loading="lazy"/></a>`;
      } else if (isVideo(file.name)) {
        const url = `/${relPath}`;
        // MOV may not play in all browsers; provide controls
        item.innerHTML = `<video src="${url}" controls preload="metadata"></video>`;
      }
      grid.appendChild(item);
    });
    container.innerHTML = '';
    container.appendChild(grid);
  }

  // Fallback album list for local development
  const FALLBACK_ALBUMS = [
    { slug: 'Apple_Picking2025', cover: '/img/travel/Apple_Picking2025/', date: 'Date: October 11, 2025' },
    { slug: 'Boston', cover: '/img/travel/Boston/', date: 'Date: Since 2023' },
    { slug: 'MIT-pictures', cover: '/img/travel/MIT-pictures/', date: 'Date: Since 2023' },
    { slug: 'New_York_2023', cover: '/img/travel/New_York_2023/', date: 'Date: December 24, 2024' },
    { slug: 'Picturesque_Pierce', cover: '/img/travel/Picturesque_Pierce/', date: 'Date: January 12, 2025' },
    { slug: 'Random_Nepal', cover: '/img/travel/Random_Nepal/', date: 'Date: Various' },
    { slug: 'rara-nepal', cover: '/img/travel/rara-nepal/', date: 'Date: October, 2021' }
  ];

  // Create a map for quick date lookup
  const ALBUM_DATES = {};
  FALLBACK_ALBUMS.forEach(({ slug, date }) => {
    ALBUM_DATES[slug] = date;
  });

  // Fallback file lists for each album (when API is unavailable)
  const FALLBACK_FILES = {
    'Apple_Picking2025': ['IMG_5296.jpg','IMG_5301.jpg','IMG_5303.jpg','IMG_5304.jpg','IMG_5305.jpg','IMG_5306.jpg','IMG_5307.jpg','IMG_5308.jpg','IMG_5309.jpg','IMG_5312.jpg','IMG_5313.jpg','IMG_5323.jpg','IMG_5324.jpg','IMG_5325.jpg','IMG_5329.jpg','IMG_5335.jpg','IMG_5337.jpg','IMG_5338.jpg','IMG_5339.jpg','IMG_5342.HEIC','IMG_5342.jpg','dddd.JPEG'],
    'MIT-pictures': ['IMG_3210.jpg','IMG_3211.jpg','IMG_3214.jpg','IMG_3217.jpg','IMG_3218.jpg','IMG_3219.jpg','IMG_3220.jpg','IMG_3221.jpg','IMG_3223.jpg','IMG_3224.jpg','IMG_3269.jpg','IMG_3271.jpg','IMG_3341.jpg','IMG_3343.jpg','IMG_3350.jpg','IMG_3358.jpg','IMG_3964.jpg','IMG_3965.jpg','IMG_3967.jpg','IMG_4645.jpg','IMG_4649.jpg','IMG_4650.jpg','IMG_4651.jpg','IMG_4652.jpg','IMG_4656.jpg','IMG_4657.jpg','IMG_4658.jpg','IMG_4674.jpg','IMG_4675.jpg','IMG_4676.jpg','IMG_4677.jpg','IMG_4680.jpg','IMG_4681.jpg','IMG_4683.jpg','IMG_5144.jpg','IMG_5508.jpg','IMG_5576.jpg','IMG_5779.jpg','IMG_5783.jpg','IMG_5784.jpg','IMG_5871.jpg','IMG_5879.jpg','IMG_5890.jpg','IMG_5891.jpg','IMG_6172.jpg','IMG_6460.jpg','IMG_6522.jpg','IMG_6523.jpg','IMG_6524.jpg','IMG_6525.jpg','IMG_6527.jpg','IMG_6611.jpg','IMG_6865.jpg','IMG_6995.jpg','IMG_7003.jpg','IMG_7070.jpg','IMG_7102.jpg','IMG_7103.jpg','IMG_7104.jpg','IMG_7105.jpg','IMG_7106.jpg','IMG_7109.jpg','IMG_7130.jpg','IMG_7996.jpg','IMG_9305.jpg','IMG_9353.jpg','IMG_9656.jpg','IMG_9657.jpg','IMG_9890.jpg','IMG_9911.jpg'],
    'Boston': ['output-1.jpg','output-2.jpg','output-3.jpg','output-4.jpg','output-5.jpg','output-6.jpg','output-7.jpg','output-9.jpg','output-10.jpg','output-11.jpg','output-12.jpg','output-13.jpg','output-14.jpg','output-15.jpg','output-16.jpg','output-17.jpg','output-18.jpg','output-19.jpg','output-20.jpg','output-21.jpg','output-23.jpg','output-24.jpg','output-25.jpg','output-26.jpg','output-27.jpg','output-28.jpg'],
    'New_York_2023': ['IMG_1381.jpg','IMG_1382.jpg','IMG_1428.jpg','IMG_1438.jpg','IMG_8168.jpg','IMG_8220.jpg','IMG_8240.jpg','IMG_8428.jpg','IMG_8457.jpg','IMG_8502.jpg','IMG_8503.jpg','IMG_8700.jpg','IMG_9048.jpg'],
    'Picturesque_Pierce': ['IMG_5088.jpg','IMG_5092.jpg','IMG_5094.jpg','IMG_5098.jpg','IMG_5105.jpg','IMG_5111.jpg','IMG_5121.jpg','IMG_5125.jpg','IMG_5130.jpg','IMG_5131.jpg','IMG_5132.jpg','IMG_5133.jpg','IMG_5134.jpg','IMG_5135.jpg','IMG_5136.jpg','IMG_5137.jpg','IMG_5138.jpg'],
    'Random_Nepal': ['20181003_175810.jpg','20181004_095622.jpg','20181004_095845.jpg','20181005_081401.jpg','IMG_2933.jpg','IMG_2941.jpg','IMG_3099.jpg','IMG_3106.jpg','IMG_4626.JPG'],
    'rara-nepal': ['IMG_20211009_134131.jpg','IMG_20211009_134350.jpg','IMG_20211009_154710.jpg','IMG_20211010_100914.jpg','IMG_20211010_101814.jpg','IMG_20211010_103959.jpg','IMG_20211010_114450.jpg','IMG_20211010_115338.jpg','IMG_20211010_115820.jpg','IMG_20211010_120524.jpg','IMG_20211010_132536.jpg','IMG_20211011_091107.jpg','IMG_20211011_101650.jpg','IMG_20211011_144849.jpg','IMG_20211012_120133.jpg','IMG_6861.jpg','IMG_6897.jpg','IMG_6907.jpg','IMG_6963.jpg','IMG_6975.jpg','IMG_6982.jpg','IMG_7031.jpg','IMG_7035.jpg','IMG_7141.jpg','IMG_7216.jpg','IMG_7217.jpg','IMG_7219.jpg','IMG_7270.jpg','IMG_7296.jpg','IMG_7428.jpg','IMG_7432.jpg','IMG_7436.jpg']
  };

  async function renderTravelHub(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    
    // Try GitHub API first, fallback to hardcoded list
    let dirs = [];
    try {
      const nodes = await listFolder(BASE);
      dirs = nodes.filter(n => n.type === 'dir');
      console.log('GitHub API SUCCESS - found dirs:', dirs.map(d => d.name));
    } catch (err) {
      console.log('GitHub API error:', err);
      dirs = [];
    }
    
    // If no directories found via API, use fallback list
    if (dirs.length === 0) {
      console.log('No dirs from API, using fallback album list');
      const grid = document.createElement('div');
      grid.className = 'gallery-grid gallery-grid-cards';
      
      FALLBACK_ALBUMS.forEach(({ slug, cover, date }) => {
        const card = document.createElement('a');
        card.className = 'travel-card';
        card.href = `/travel/${slug}.html`;
        console.log('Creating card for:', slug);
        card.innerHTML = `
          <div class="travel-card-media" style="background-image:url('${cover}')"></div>
          <div class="travel-card-body">
            <h4>${toTitle(slug)}</h4>
            <span class="link-muted">${date}</span>
          </div>
        `;
        grid.appendChild(card);
      });
      container.innerHTML = '';
      container.appendChild(grid);
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'gallery-grid gallery-grid-cards';

    // For each dir, attempt to find a cover image by fetching the folder and picking the first image
    const cards = await Promise.all(dirs.map(async d => {
      const slug = d.name;
      let cover = '';
      try {
        const files = await listFolder(`${BASE}/${slug}`);
        const img = files.find(f => f.type === 'file' && isImage(f.name));
        if (img) cover = `/${BASE}/${slug}/${img.name}`;
      } catch {}
      return { slug, cover };
    }));

    cards.forEach(({ slug, cover }) => {
      const card = document.createElement('a');
      card.className = 'travel-card';
      card.href = `/travel/${slug}.html`;
      const date = ALBUM_DATES[slug] || 'Date: .......';
      card.innerHTML = `
        <div class="travel-card-media" ${cover ? `style="background-image:url('${cover}')"`  : ''}></div>
        <div class="travel-card-body">
          <h4>${toTitle(slug)}</h4>
          <span class="link-muted">${date}</span>
        </div>
      `;
      grid.appendChild(card);
    });
    container.innerHTML = '';
    container.appendChild(grid);
  }

  // Expose globals
  window.TravelGallery = { renderAlbumGallery, renderTravelHub };
})();

// Enhanced lightbox viewer with navigation
(function(){
  let currentIndex = 0;
  let imageUrls = [];
  
  function createLightbox(){
    if (document.getElementById('lb-overlay')) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'lb-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);display:none;align-items:center;justify-content:center;z-index:9999;';
    
    const container = document.createElement('div');
    container.style.cssText = 'position:relative;max-width:90vw;max-height:90vh;display:flex;align-items:center;justify-content:center;';
    
    const img = document.createElement('img');
    img.id = 'lb-image';
    img.style.cssText = 'max-width:100%;max-height:90vh;box-shadow:0 10px 40px rgba(0,229,255,0.3);border-radius:8px;user-select:none;';
    
    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.id = 'lb-prev';
    prevBtn.innerHTML = '&#8249;';
    prevBtn.style.cssText = 'position:absolute;left:-60px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.9);border:none;width:50px;height:50px;border-radius:50%;font-size:30px;cursor:pointer;transition:all 0.3s;color:#333;display:flex;align-items:center;justify-content:center;';
    prevBtn.onmouseover = () => prevBtn.style.background = 'rgba(255,255,255,1)';
    prevBtn.onmouseout = () => prevBtn.style.background = 'rgba(255,255,255,0.9)';
    
    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.id = 'lb-next';
    nextBtn.innerHTML = '&#8250;';
    nextBtn.style.cssText = 'position:absolute;right:-60px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.9);border:none;width:50px;height:50px;border-radius:50%;font-size:30px;cursor:pointer;transition:all 0.3s;color:#333;display:flex;align-items:center;justify-content:center;';
    nextBtn.onmouseover = () => nextBtn.style.background = 'rgba(255,255,255,1)';
    nextBtn.onmouseout = () => nextBtn.style.background = 'rgba(255,255,255,0.9)';
    
    // Counter
    const counter = document.createElement('div');
    counter.id = 'lb-counter';
    counter.style.cssText = 'position:absolute;bottom:-40px;left:50%;transform:translateX(-50%);color:#fff;font-size:14px;';
    
    container.appendChild(img);
    container.appendChild(prevBtn);
    container.appendChild(nextBtn);
    container.appendChild(counter);
    overlay.appendChild(container);
    
    // Event listeners
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate(-1);
    });
    
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate(1);
    });
    
    // Click on overlay background to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeLightbox();
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', handleKeyboard);
    
    document.body.appendChild(overlay);
  }
  
  function handleKeyboard(e) {
    const overlay = document.getElementById('lb-overlay');
    if (!overlay || overlay.style.display === 'none') return;
    
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') navigate(-1);
    else if (e.key === 'ArrowRight') navigate(1);
  }
  
  function navigate(direction) {
    currentIndex += direction;
    if (currentIndex < 0) currentIndex = imageUrls.length - 1;
    if (currentIndex >= imageUrls.length) currentIndex = 0;
    showImage(currentIndex);
  }
  
  function showImage(index) {
    const img = document.getElementById('lb-image');
    const counter = document.getElementById('lb-counter');
    img.src = imageUrls[index];
    counter.textContent = `${index + 1} / ${imageUrls.length}`;
  }
  
  function openLightbox(url, allUrls) {
    createLightbox();
    imageUrls = allUrls;
    currentIndex = allUrls.indexOf(url);
    if (currentIndex === -1) currentIndex = 0;
    
    const overlay = document.getElementById('lb-overlay');
    overlay.style.display = 'flex';
    showImage(currentIndex);
  }
  
  function closeLightbox() {
    const overlay = document.getElementById('lb-overlay');
    overlay.style.display = 'none';
  }
  
  function onClick(e){
    const a = e.target.closest('a.lightbox-link');
    if(!a) return;
    e.preventDefault();
    
    // Get all image links in the gallery
    const gallery = a.closest('.gallery-grid');
    if (!gallery) return;
    
    const allLinks = Array.from(gallery.querySelectorAll('a.lightbox-link'));
    const allUrls = allLinks.map(link => link.getAttribute('href'));
    const clickedUrl = a.getAttribute('href');
    
    openLightbox(clickedUrl, allUrls);
  }
  
  window.addEventListener('click', onClick);
})();
