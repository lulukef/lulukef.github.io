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
    const items = await listFolder(path);
    if (!Array.isArray(items) || items.length === 0) {
      container.innerHTML = `<div class="text-center link-muted">No media found yet. Drop images/videos in <code>${path}</code>.</div>`;
      return;
    }
    const media = items.filter(i => i.type === 'file' && (isImage(i.name) || isHeic(i.name) || isVideo(i.name)));
    if (media.length === 0) {
      container.innerHTML = `<div class="text-center link-muted">No supported media found (images/videos).</div>`;
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

  async function renderTravelHub(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const nodes = await listFolder(BASE);
    const dirs = nodes.filter(n => n.type === 'dir');
    if (dirs.length === 0) {
      container.innerHTML = `<div class="text-center link-muted">No albums yet. Create folders under <code>${BASE}/</code>.</div>`;
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
      card.innerHTML = `
        <div class="travel-card-media" ${cover ? `style="background-image:url('${cover}')"` : ''}></div>
        <div class="travel-card-body">
          <h4>${toTitle(slug)}</h4>
          <span class="link-muted">${slug}</span>
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

// Simple lightbox viewer
(function(){
  function createLightbox(){
    if (document.getElementById('lb-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'lb-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:none;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    const img = document.createElement('img');
    img.id = 'lb-image';
    img.style.cssText = 'max-width:95%;max-height:95%;box-shadow:0 10px 40px rgba(0,229,255,0.2);border-radius:10px;';
    overlay.appendChild(img);
    overlay.addEventListener('click', ()=> overlay.style.display='none');
    document.body.appendChild(overlay);
  }
  function onClick(e){
    const a = e.target.closest('a.lightbox-link');
    if(!a) return;
    e.preventDefault();
    createLightbox();
    const overlay = document.getElementById('lb-overlay');
    const img = document.getElementById('lb-image');
    img.src = a.getAttribute('href');
    overlay.style.display = 'flex';
  }
  window.addEventListener('click', onClick);
})();
