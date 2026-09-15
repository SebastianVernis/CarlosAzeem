(function () {
  // Progreso virtual (0.0 a 1.0)
  let currentProgress = 0.0;
  let targetProgress = 0.0;

  // Puntos de reposo: un gesto de scroll avanza al siguiente y la transición
  // se interpola. Incluye los carruseles (Registro & Impacto y Cuarto de Paz)
  // para recorrer cada card con un solo scroll.
  const SECTION_STOPS = [0.0, 0.20, 0.37, 0.45, 0.53, 0.618, 0.663, 0.708, 0.752, 0.797, 0.842, 0.90, 0.931, 0.96, 1.0];
  const STEP_COOLDOWN_MS = 220;
  const PROGRESS_EASE = 0.085;
  let lastStepAt = 0;

  // Parallax del ratón suave
  let mouseX = 0;
  let mouseY = 0;
  let currentMouseX = 0;
  let currentMouseY = 0;

  // Elementos del DOM
  const portraitStage = document.getElementById('stage-portrait');
  const portraitBg = document.getElementById('portrait-bg');
  const portraitImg = document.getElementById('portrait-img');
  const titleBlock = document.getElementById('stage-title-block');
  const bioBlock = document.getElementById('stage-biography');
  const ejesBlock = document.getElementById('stage-ejes');
  const ejesHeader = document.getElementById('stage-ejes-header');
  const impactoBlock = document.getElementById('stage-impacto');
  const impactoHeader = document.getElementById('stage-impacto-header');
  const impactoStage = document.getElementById('impacto-stage');
  const impactoGrid = document.getElementById('impacto-grid');
  const cuartoBlock = document.getElementById('stage-cuarto');
  const cuartoHeader = document.getElementById('stage-cuarto-header');
  const progressLine = document.getElementById('virtual-progress-line');
  const canvasBg = document.getElementById('ambient-canvas');
  const hintText = document.getElementById('progress-hint');
  const navButtons = document.querySelectorAll('.stage-nav-btn');

  // Cards individuales para animación secuencial
  const pilarCards = [
    document.getElementById('pilar-card-1'),
    document.getElementById('pilar-card-2'),
    document.getElementById('pilar-card-3')
  ];

  const impactoCards = [
    document.getElementById('impacto-card-1'),
    document.getElementById('impacto-card-2'),
    document.getElementById('impacto-card-3'),
    document.getElementById('impacto-card-4'),
    document.getElementById('impacto-card-5'),
    document.getElementById('impacto-card-6')
  ];

  const cuartoCards = [
    document.getElementById('cuarto-card-1'),
    document.getElementById('cuarto-card-2'),
    document.getElementById('cuarto-card-3')
  ];

  // Tilt 3D de las cards siguiendo el puntero: guarda la posición del cursor y
  // expone variables CSS para la sombra y el borde luminoso.
  function registerTilt(card) {
    if (!card) return;
    card._tiltTX = 0;
    card._tiltTY = 0;
    card._tiltX = 0;
    card._tiltY = 0;
    card.addEventListener('pointermove', function (e) {
      const r = card.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const nx = clamp((e.clientX - r.left) / r.width, 0, 1);
      const ny = clamp((e.clientY - r.top) / r.height, 0, 1);
      const dx = (nx - 0.5) * 2;
      const dy = (ny - 0.5) * 2;
      card._tiltTX = dx;
      card._tiltTY = dy;
      card.style.setProperty('--mx', (nx * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (ny * 100).toFixed(1) + '%');
      card.style.setProperty('--sx', (dx * 24).toFixed(1) + 'px');
      card.style.setProperty('--sy', (dy * 24).toFixed(1) + 'px');
    });
    card.addEventListener('pointerleave', function () {
      card._tiltTX = 0;
      card._tiltTY = 0;
      card.style.setProperty('--sx', '0px');
      card.style.setProperty('--sy', '0px');
    });
  }
  pilarCards.forEach(registerTilt);
  impactoCards.forEach(registerTilt);
  cuartoCards.forEach(registerTilt);

  // Compone la transformación base del carrusel con la inclinación 3D suavizada.
  function cardTransform(card, base) {
    card._tiltX = lerp(card._tiltX, card._tiltTX, 0.12);
    card._tiltY = lerp(card._tiltY, card._tiltTY, 0.12);
    if (Math.abs(card._tiltX) < 0.0005) card._tiltX = 0;
    if (Math.abs(card._tiltY) < 0.0005) card._tiltY = 0;
    const rx = (-card._tiltY * 9).toFixed(2);
    const ry = (card._tiltX * 11).toFixed(2);
    return `perspective(900px) ${base} rotateX(${rx}deg) rotateY(${ry}deg)`;
  }

  // Auxiliares matemáticos con curva suave y holgada
  function clamp(val, min = 0, max = 1) {
    return Math.min(Math.max(val, min), max);
  }

  function remap(val, inMin, inMax) {
    return clamp((val - inMin) / (inMax - inMin));
  }

  // Suavizado cinemático quíntico (smootherstep) para transiciones ultragraduales sin cortes perceptibles
  function smoothstep(val, inMin, inMax) {
    const t = remap(val, inMin, inMax);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Posición de carrusel con pausas: recorre 0..n-1 deteniéndose en cada tarjeta.
  // `u` está en [0, 1]; `travelFrac` es la fracción del rango usada en los
  // desplazamientos (el resto son pausas donde la tarjeta se ve completa).
  function carouselPos(u, n, travelFrac) {
    const x = clamp(u, 0, 1);
    const tr = travelFrac / (n - 1);
    const hd = (1 - travelFrac) / n;
    let t = 0;
    for (let i = 0; i < n; i++) {
      if (x <= t + hd) return i;
      t += hd;
      if (i < n - 1) {
        if (x <= t + tr) {
          const k = (x - t) / tr;
          return i + k * k * k * (k * (k * 6 - 15) + 10);
        }
        t += tr;
      }
    }
    return n - 1;
  }

  // 1. NAVEGACIÓN POR PASOS: cada gesto avanza a la siguiente sección o card.
  //    El cooldown evita que un mismo gesto consuma varios pasos de golpe.
  function stepProgress(dir) {
    const now = performance.now();
    if (now - lastStepAt < STEP_COOLDOWN_MS) return;
    lastStepAt = now;

    let next;
    if (dir > 0) {
      next = 1;
      for (let i = 0; i < SECTION_STOPS.length; i++) {
        if (SECTION_STOPS[i] > targetProgress + 0.001) { next = SECTION_STOPS[i]; break; }
      }
    } else {
      next = 0;
      for (let i = SECTION_STOPS.length - 1; i >= 0; i--) {
        if (SECTION_STOPS[i] < targetProgress - 0.001) { next = SECTION_STOPS[i]; break; }
      }
    }
    targetProgress = clamp(next, 0, 1);
  }

  function handleWheel(e) {
    e.preventDefault();
    const raw = e.deltaY || e.detail || 0;
    if (raw === 0) return;
    stepProgress(raw > 0 ? 1 : -1);
  }

  window.addEventListener('wheel', handleWheel, { passive: false });
  document.addEventListener('wheel', handleWheel, { passive: false });

  // 2. TÁCTIL: un swipe avanza una sección (se evalúa al soltar el dedo).
  let touchStartY = 0;
  window.addEventListener('touchstart', function (e) {
    if (e.touches && e.touches.length > 0) {
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  window.addEventListener('touchmove', function (e) {
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('touchend', function (e) {
    const endY = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : touchStartY;
    const deltaY = touchStartY - endY;
    if (Math.abs(deltaY) > 36) stepProgress(deltaY > 0 ? 1 : -1);
  }, { passive: true });

  // 3. TECLADO: avanza un paso por pulsación (Home/End saltan a los extremos).
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      stepProgress(1);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      stepProgress(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      lastStepAt = performance.now();
      targetProgress = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      lastStepAt = performance.now();
      targetProgress = 1;
    }
  });

  // 4. PARALLAX CON MOVIMIENTO DEL RATÓN (LERP LENTO)
  window.addEventListener('mousemove', function (e) {
    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;
    mouseX = (e.clientX - halfW) / halfW;
    mouseY = (e.clientY - halfH) / halfH;
  });

  // 5. INTERACCIÓN CON BOTONES DE NAVEGACIÓN INFERIOR
  navButtons.forEach(btn => {
    btn.addEventListener('click', function () {
      const targetVal = parseFloat(this.getAttribute('data-target-step') || 0);
      targetProgress = targetVal;
    });
  });

  function updateNavHighlight(p) {
    let activeIndex = 0;
    if (p < 0.22) activeIndex = 0;
    else if (p < 0.48) activeIndex = 1;
    else if (p < 0.76) activeIndex = 2;
    else activeIndex = 3;

    navButtons.forEach((btn, idx) => {
      const dot = btn.querySelector('.stage-dot');
      if (idx === activeIndex) {
        btn.classList.add('text-[#00f0ff]');
        btn.classList.remove('text-white/40');
        if (dot) {
          dot.classList.add('bg-[#00f0ff]', 'shadow-[0_0_8px_#00f0ff]');
          dot.classList.remove('bg-white/20');
        }
      } else {
        btn.classList.remove('text-[#00f0ff]');
        btn.classList.add('text-white/40');
        if (dot) {
          dot.classList.remove('bg-[#00f0ff]', 'shadow-[0_0_8px_#00f0ff]');
          dot.classList.add('bg-white/20');
        }
      }
    });
  }

  // 6. BUCLE DE RENDERIZADO CINEMÁTICO CON TRANSICIONES AMPLIAS Y GRADUALES
  function renderLoop() {
    // Interpolación suave hacia el destino: el salto de sección se dibuja
    // gradualmente (empieza al primer scroll y se asienta solo).
    currentProgress += (targetProgress - currentProgress) * PROGRESS_EASE;
    if (Math.abs(targetProgress - currentProgress) < 0.0003) {
      currentProgress = targetProgress;
    }

    currentMouseX = lerp(currentMouseX, mouseX, 0.035);
    currentMouseY = lerp(currentMouseY, mouseY, 0.035);

    const p = currentProgress;
    const isDesktop = window.innerWidth >= 1024;
    const mX = currentMouseX;
    const mY = currentMouseY;

    // Barra de progreso lateral
    if (progressLine) {
      progressLine.style.transform = `scaleY(${p})`;
    }

    // Indicadores de fase
    updateNavHighlight(p);

    if (hintText) {
      if (p < 0.22) hintText.textContent = "01 / RETRATO";
      else if (p < 0.48) hintText.textContent = "02 / SEMBLANZA";
      else if (p < 0.76) hintText.textContent = "03 / TRES PILARES";
      else hintText.textContent = "04 / REGISTRO & IMPACTO";
    }

    // Bruma ambiental con desplazamiento aterciopelado
    if (canvasBg) {
      canvasBg.style.transform = `translate3d(${mX * 18}px, ${p * 50 + mY * 15}px, 0)`;
    }

    // =============================================================
    // ETAPA 1: HERO TITLE (Transición extendida y suave)
    // =============================================================
    if (titleBlock) {
      let tOpacity = 1.0;
      let tY = 0;
      let tBlur = 0;
      let tScale = 1.0;

      if (p <= 0.04) {
        tOpacity = 1.0;
        tY = 0;
        tBlur = 0;
        tScale = 1.0;
      } else if (p < 0.12) {
        const tFade = smoothstep(p, 0.04, 0.12);
        tOpacity = 1.0 - tFade;
        tY = lerp(0, -36, tFade);
        tBlur = tFade * 12;
        tScale = lerp(1.0, 0.95, tFade);
      } else {
        tOpacity = 0.0;
      }

      if (tOpacity <= 0.001) {
        titleBlock.style.display = 'none';
        titleBlock.style.opacity = '0';
      } else {
        titleBlock.style.display = 'block';
        const tX = mX * 6;
        titleBlock.style.transform = `translate3d(${tX}px, ${tY + (mY * -6)}px, 0) scale(${tScale})`;
        titleBlock.style.opacity = tOpacity.toFixed(4);
        titleBlock.style.filter = `blur(${tBlur.toFixed(2)}px)`;
      }
    }

    // =============================================================
    // OBJETO: RETRATO DE CARLOS AZEEM (Desplazamiento y disolución suave)
    // =============================================================
    if (portraitStage) {
      let portMove = 0.0;
      let portOpacity = 1.0;
      let portBlur = 0.0;
      let portExit = 0.0;

      if (p <= 0.04) {
        portMove = 0.0;
        portOpacity = 1.0;
        portBlur = 0.0;
      } else if (p < 0.12) {
        portMove = smoothstep(p, 0.04, 0.12);
        portOpacity = 1.0;
        portBlur = 0.0;
      } else if (p <= 0.28) {
        portMove = 1.0;
        portOpacity = 1.0;
        portBlur = 0.0;
      } else if (p < 0.40) {
        const fadeOut = smoothstep(p, 0.28, 0.40);
        portMove = 1.0;
        portOpacity = 1.0 - fadeOut;
        portBlur = fadeOut * 14;
        portExit = fadeOut;
      } else {
        portOpacity = 0.0;
      }

      // En móvil la imagen se muestra completa y se desvanece mientras el texto
      // (semblanza) se dibuja encima; al terminar solo queda el texto.
      if (!isDesktop) {
        const mobileFade = smoothstep(p, 0.05, 0.16);
        portOpacity = 1.0 - mobileFade;
        portBlur = mobileFade * 6;
      }

      if (portOpacity <= 0.001) {
        portraitStage.style.display = 'none';
        portraitStage.style.opacity = '0';
      } else {
        portraitStage.style.display = 'flex';
        if (isDesktop) {
          const portX = lerp(0, -25, portMove);
          const portScale = lerp(1.02, 0.95, portMove);
          const parallaxX = mX * 8;
          const parallaxY = mY * 8;
          portraitStage.style.transform = `translate3d(calc(${portX}vw + ${parallaxX}px), ${parallaxY - portExit * 30}px, 0) scale(${portScale})`;
        } else {
          const portScale = lerp(1.0, 0.99, portMove);
          portraitStage.style.transform = `translate3d(0, ${mY * 5 - portExit * 24}px, 0) scale(${portScale})`;
        }
        portraitStage.style.opacity = portOpacity.toFixed(4);
        portraitStage.style.filter = `blur(${portBlur.toFixed(2)}px)`;

        // Contorno tenue de la imagen: se desvanece cuando entra la siguiente sección
        if (portraitImg) {
          const glow = Math.max(0, 1 - portMove);
          portraitImg.style.filter = `grayscale(1) contrast(1.1) brightness(0.95) drop-shadow(0 0 10px rgba(0, 240, 255, ${(0.38 * glow).toFixed(3)})) drop-shadow(0 0 28px rgba(0, 240, 255, ${(0.15 * glow).toFixed(3)}))`;
        }

        // Fondo negro con contorno que entra junto con la siguiente sección (en parallax)
        if (portraitBg) {
          const bgAppear = smoothstep(p, 0.06, 0.20);
          const bgX = mX * -16 + lerp(0, -10, portMove);
          const bgY = mY * -16 + lerp(0, 8, portMove);
          const bgScale = lerp(1.0, 1.14, portMove);
          portraitBg.style.opacity = (bgAppear * portOpacity).toFixed(4);
          portraitBg.style.transform = `translate3d(${bgX}px, ${bgY}px, 0) scale(${bgScale})`;
        }
      }
    }

    // =============================================================
    // ETAPA 2: SEMBLANZA BIOGRÁFICA (Entrada y salida ampliada)
    // =============================================================
    if (bioBlock) {
      let bOpacity = 0.0;
      let bX = 35;
      let bBlur = 10;

      if (p < 0.04) {
        bOpacity = 0.0;
      } else if (p < 0.12) {
        const enter = smoothstep(p, 0.04, 0.12);
        bOpacity = enter;
        bX = lerp(35, 0, enter);
        bBlur = (1 - enter) * 10;
      } else if (p <= 0.28) {
        bOpacity = 1.0;
        bX = 0;
        bBlur = 0;
      } else if (p < 0.40) {
        const exit = smoothstep(p, 0.28, 0.40);
        bOpacity = 1.0 - exit;
        bX = lerp(0, -30, exit);
        bBlur = exit * 10;
      } else {
        bOpacity = 0.0;
      }

      if (bOpacity <= 0.001) {
        bioBlock.style.display = 'none';
        bioBlock.style.opacity = '0';
        bioBlock.style.pointerEvents = 'none';
      } else {
        bioBlock.style.display = 'block';
        bioBlock.style.transform = `translate3d(${bX + (mX * -5)}px, ${mY * -5}px, 0)`;
        bioBlock.style.opacity = bOpacity.toFixed(4);
        bioBlock.style.filter = `blur(${bBlur.toFixed(2)}px)`;
        bioBlock.style.pointerEvents = (p >= 0.14 && p <= 0.34) ? 'auto' : 'none';
      }
    }

    // =========================================================================
    // ETAPA 3: TRES PILARES - RETRASO/DESFASE ENTRE TÍTULO Y CARDS
    // El título/encabezado se asienta primero [0.44 - 0.54], y solo tras un margen
    // marcado de scroll las cards inician su entrada escalonada [0.55 - 0.72]
    // =========================================================================
    if (ejesBlock) {
      let eOpacity = 0.0;
      let eExit = 0.0;

      if (p < 0.28) {
        eOpacity = 0.0;
      } else if (p < 0.34) {
        eOpacity = smoothstep(p, 0.28, 0.34);
      } else if (p <= 0.55) {
        eOpacity = 1.0;
      } else if (p < 0.63) {
        eExit = smoothstep(p, 0.55, 0.63);
        eOpacity = 1.0 - eExit;
      } else {
        eOpacity = 0.0;
      }

      if (eOpacity <= 0.001) {
        ejesBlock.style.display = 'none';
        ejesBlock.style.opacity = '0';
        ejesBlock.style.pointerEvents = 'none';
      } else {
        const eY = lerp(0, -34, eExit);
        const eBlur = eExit * 10;
        ejesBlock.style.display = 'flex';
        ejesBlock.style.transform = `translate3d(${mX * -6}px, ${eY + mY * -6}px, 0)`;
        ejesBlock.style.opacity = eOpacity.toFixed(4);
        ejesBlock.style.filter = eBlur < 0.01 ? 'none' : `blur(${eBlur.toFixed(2)}px)`;
        ejesBlock.style.pointerEvents = (p >= 0.33 && p <= 0.56) ? 'auto' : 'none';

        // Encabezado: entra, se sostiene y sale por su cuenta (arriba + blur).
        if (ejesHeader) {
          let hProg = smoothstep(p, 0.29, 0.34);
          let hExit = smoothstep(p, 0.53, 0.61);
          let hOpac = hProg * (1 - hExit);
          let hY = lerp(26, 0, hProg) + lerp(0, -24, hExit);
          let hBlur = (1 - hProg) * 8 + hExit * 8;

          ejesHeader.style.opacity = hOpac.toFixed(4);
          ejesHeader.style.transform = `translate3d(0, ${hY}px, 0)`;
          ejesHeader.style.filter = `blur(${hBlur.toFixed(2)}px)`;
        }

        // Carrusel de una card a la vez: al entrar la siguiente, la anterior se
        // desplaza fuera del espacio y se desvanece (igual que las otras etapas).
        const carU = clamp((p - 0.34) / (0.56 - 0.34), 0, 1);
        const carT = carouselPos(carU, pilarCards.length, 0.20);
        const carDirs = [[1, 0], [0, -1], [-1, 0]];

        pilarCards.forEach((card, idx) => {
          if (!card) return;
          const offset = idx - carT;
          const dist = Math.abs(offset);
          const dir = carDirs[idx] || [1, 0];
          const len = Math.hypot(dir[0], dir[1]) || 1;
          const cardOpac = clamp(1 - dist, 0, 1);
          const cX = offset * (dir[0] / len) * 62;
          const cY = offset * (dir[1] / len) * 62;
          const cScale = lerp(1.0, 0.86, Math.min(dist, 1));
          const cBlur = Math.min(dist, 1) * 4;

          card.style.opacity = cardOpac.toFixed(4);
          card.style.transform = cardTransform(card, `translate3d(${cX}%, ${cY}%, 0) scale(${cScale})`);
          card.style.filter = cBlur < 0.01 ? 'none' : `blur(${cBlur.toFixed(2)}px)`;
          card.style.pointerEvents = cardOpac >= 0.85 ? 'auto' : 'none';
        });
      }
    }

    // =========================================================================
    // ETAPA 4: REGISTRO E IMPACTO - CARRUSEL GRANDE → GRID COMPLETO
    // =========================================================================
    if (impactoBlock) {
      let iOpacity = 0.0;
      let iExit = 0.0;

      if (p < 0.56) {
        iOpacity = 0.0;
      } else if (p < 0.62) {
        iOpacity = smoothstep(p, 0.56, 0.62);
      } else if (p <= 0.84) {
        iOpacity = 1.0;
      } else if (p < 0.90) {
        iExit = smoothstep(p, 0.84, 0.90);
        iOpacity = 1.0 - iExit;
      } else {
        iOpacity = 0.0;
      }

      if (iOpacity <= 0.001) {
        impactoBlock.style.display = 'none';
        impactoBlock.style.opacity = '0';
        impactoBlock.style.pointerEvents = 'none';
      } else {
        const iY = lerp(0, -34, iExit);
        const iBlur = iExit * 10;
        impactoBlock.style.display = 'grid';
        impactoBlock.style.transform = `translate3d(${mX * -6}px, ${iY + mY * -6}px, 0)`;
        impactoBlock.style.opacity = iOpacity.toFixed(4);
        impactoBlock.style.filter = iBlur < 0.01 ? 'none' : `blur(${iBlur.toFixed(2)}px)`;
        impactoBlock.style.pointerEvents = (p >= 0.60 && p <= 0.88) ? 'auto' : 'none';

        // 1. TÍTULO Y SUBTÍTULO DE FASE 4:
        if (impactoHeader) {
          let ihProg = smoothstep(p, 0.56, 0.62);
          let ihExit = smoothstep(p, 0.80, 0.86);
          let ihOpac = ihProg * (1 - ihExit);
          let ihY = lerp(26, 0, ihProg) + lerp(0, -18, ihExit);
          let ihBlur = (1 - ihProg) * 8 + (ihExit * 8);

          impactoHeader.style.opacity = ihOpac.toFixed(4);
          impactoHeader.style.transform = `translate3d(0, ${ihY}px, 0)`;
          impactoHeader.style.filter = `blur(${ihBlur.toFixed(2)}px)`;
        }

        // 2. ESCENARIO: CARRUSEL ÚNICO DE REGISTRO DE MEDIOS
        // - 0.60–0.86: carrusel con pausas largas (travelFrac bajo): cada tarjeta
        //   permanece estática mucho más de lo que tarda en pasar a la siguiente.
        const carU = clamp((p - 0.60) / (0.86 - 0.60), 0, 1);
        const carT = carouselPos(carU, impactoCards.length, 0.18);

        impactoGrid.style.opacity = '1';
        impactoGrid.style.transform = '';
        impactoGrid.style.filter = '';

        // Cada tarjeta entra desde un punto distinto: derecha, arriba, izquierda,
        // abajo, noreste y noroeste. Se evita que dos contiguas sean opuestas para
        // que no se superpongan al cruzarse.
        const carDirs = [
          [1, 0], [0, -1], [-1, 0], [0, 1], [1, -1], [-1, -1]
        ];

        impactoCards.forEach((card, idx) => {
          if (!card) return;
          const offset = idx - carT;
          const dist = Math.abs(offset);
          const dir = carDirs[idx] || [1, 0];
          const len = Math.hypot(dir[0], dir[1]) || 1;
          // Crossfade continuo: la tarjeta central se ve completa y las vecinas se
          // asoman desvaneciéndose, así nunca queda un hueco vacío entre tarjetas.
          const cardOpac = clamp(1 - dist, 0, 1);
          const cX = offset * (dir[0] / len) * 62;
          const cY = offset * (dir[1] / len) * 62;
          const cScale = lerp(1.0, 0.86, Math.min(dist, 1));
          const cBlur = Math.min(dist, 1) * 4;

          card.style.opacity = cardOpac.toFixed(4);
          card.style.transform = cardTransform(card, `translate3d(${cX}%, ${cY}%, 0) scale(${cScale})`);
          card.style.filter = cBlur < 0.01 ? 'none' : `blur(${cBlur.toFixed(2)}px)`;
          card.style.pointerEvents = cardOpac >= 0.85 ? 'auto' : 'none';
        });
      }
    }

    // =========================================================================
    // ETAPA 5: CUARTO DE PAZ - AGENCIA CONSULTORA / FIRMA DE ESTRATEGIA
    // =========================================================================
    if (cuartoBlock) {
      let cOpacity = 0.0;

      if (p < 0.86) {
        cOpacity = 0.0;
      } else if (p < 0.90) {
        cOpacity = smoothstep(p, 0.86, 0.90);
      } else {
        cOpacity = 1.0;
      }

      if (cOpacity <= 0.001) {
        cuartoBlock.style.display = 'none';
        cuartoBlock.style.opacity = '0';
        cuartoBlock.style.pointerEvents = 'none';
      } else {
        cuartoBlock.style.display = 'flex';
        cuartoBlock.style.transform = `translate3d(${mX * -6}px, ${mY * -6}px, 0)`;
        cuartoBlock.style.opacity = cOpacity.toFixed(4);
        cuartoBlock.style.pointerEvents = (p >= 0.90) ? 'auto' : 'none';

        // Primero se dibuja la información de Cuarto de Paz (logo + texto).
        // En móvil se desvanece después para ceder el espacio a las cards; en
        // escritorio se mantiene en su columna mientras el carrusel gira.
        if (cuartoHeader) {
          let cProg = smoothstep(p, 0.86, 0.90);
          let cExit = isDesktop ? 0 : smoothstep(p, 0.90, 0.925);
          let cOpac = cProg * (1 - cExit);
          let cY = lerp(26, 0, cProg) + lerp(0, -18, cExit);
          let cBlur = (1 - cProg) * 8 + cExit * 8;

          cuartoHeader.style.opacity = cOpac.toFixed(4);
          cuartoHeader.style.transform = `translate3d(0, ${cY}px, 0)`;
          cuartoHeader.style.filter = `blur(${cBlur.toFixed(2)}px)`;
        }

        // …y solo después arrancan las cards (0.92–1.00), con pausas largas.
        // 1ª entra por la derecha, 2ª por arriba, 3ª por abajo.
        const carDirs = [[1, 0], [0, -1], [0, 1]];
        const ct = clamp((p - 0.92) / (1.0 - 0.92), 0, 1);
        const carPos = carouselPos(ct, cuartoCards.length, 0.20);
        // Compuerta: las cards no aparecen hasta que la info ya está dibujada.
        const carGate = smoothstep(p, 0.90, 0.93);

        cuartoCards.forEach((card, idx) => {
          if (!card) return;
          const offset = idx - carPos;
          const dist = Math.abs(offset);
          const cardOpac = Math.max(0, 1 - dist) * carGate;
          const dir = carDirs[idx] || [1, 0];
          const span = dir[1] !== 0 ? 250 : 180;
          const tx = offset * dir[0] * span;
          const ty = offset * dir[1] * span;
          const cScale = lerp(1.0, 0.94, Math.min(dist, 1));
          const cBlur = Math.min(dist, 1) * 6;
          const parX = mX * (4 + idx * 2);
          const parY = mY * (3 + idx * 1.5);

          card.style.opacity = cardOpac.toFixed(4);
          card.style.transform = cardTransform(card, `translate3d(calc(${tx}% + ${parX}px), calc(${ty}% + ${parY}px), 0) scale(${cScale})`);
          card.style.filter = cBlur < 0.01 ? 'none' : `blur(${cBlur.toFixed(2)}px)`;
          card.style.pointerEvents = cardOpac >= 0.85 ? 'auto' : 'none';
        });
      }
    }

    requestAnimationFrame(renderLoop);
  }

  requestAnimationFrame(renderLoop);
})();

