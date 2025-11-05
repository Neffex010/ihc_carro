// === Config ===
const API_BASE = "https://14bbc250bc1d472b6c3db7535f483c4a.serveo.net/api";

// Catálogo local (para mostrar estatus inmediatamente)
const CATALOGO = {
  1: "Adelante",
  2: "Atrás",
  3: "Detener",
  4: "Vuelta adelante derecha",
  5: "Vuelta adelante izquierda",
  6: "Vuelta atrás derecha",
  7: "Vuelta atrás izquierda",
  8: "Giro 90° derecha",
  9: "Giro 90° izquierda",
  10: "Giro 360° derecha",
  11: "Giro 360° izquierda",
};

// === Configuración de OpenAI ===
let OPENAI_API_KEY = ""; // Dejar vacío inicialmente
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// Nueva URL para obtener la API key
const MOCKAPI_KEY_URL = "https://68e5385b8e116898997ee4b5.mockapi.io/apikey";

// === Configuración del Asistente ===
const WAKE_WORD = "atlas";
const ASSISTANT_NAME = "Atlas";

// === Utilidades UI ===
const statusEl = document.getElementById("status");
const tsEl = document.getElementById("timestamp");
const toastEl = document.getElementById("toast");
const toastMsg = document.getElementById("toast-msg");
const toast = new bootstrap.Toast(toastEl, { delay: 2000 });

// Elementos de UI para voz
const voiceControlBtn = document.getElementById('voice-control-btn');
const voiceStatus = document.getElementById('voice-status');
const voiceText = document.getElementById('voice-text');
const voiceIndicator = document.getElementById('voice-indicator');

// === Función para obtener la API key desde MockAPI ===
async function obtenerApiKey() {
  try {
    const response = await fetch(MOCKAPI_KEY_URL);
    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status} al obtener API key`);
    }
    const data = await response.json();
    
    // Asumiendo que tu MockAPI devuelve un array y necesitas el primer item
    // o ajusta según la estructura de tu respuesta
    if (Array.isArray(data) && data.length > 0) {
      return data[0].key || data[0].apiKey || data[0].value;
    } else if (data.key || data.apiKey || data.value) {
      return data.key || data.apiKey || data.value;
    } else {
      throw new Error("Estructura de API key no reconocida");
    }
  } catch (error) {
    console.error("Error obteniendo API key:", error);
    throw error;
  }
}

// === Función para pre-cargar la API key al iniciar (opcional) ===
async function preloadApiKey() {
  try {
    OPENAI_API_KEY = await obtenerApiKey();
    console.log("API key cargada exitosamente");
  } catch (error) {
    console.warn("No se pudo pre-cargar la API key, se intentará cuando sea necesario");
  }
}

function showToast(msg) {
  toastMsg.textContent = msg;
  toast.show();
}

function setStatus(nombre, id, fecha = null) {
  statusEl.innerHTML = `<span>${(nombre || "—").toUpperCase()}</span>` +
    (id ? `<br><small class="text-muted">ID: ${id}</small>` : "");
  tsEl.textContent = fecha ? new Date(fecha).toLocaleString() : "";
}

// === Llamadas a API ===
async function postMovimiento(id_movimiento) {
  const url = `${API_BASE}/movimientos`;
  const body = { id_movimiento };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error HTTP ${res.status}`);
  }
  return res.json();
}

async function getUltimoMovimiento() {
  const url = `${API_BASE}/movimientos/ultimo`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error HTTP ${res.status}`);
  }
  return res.json();
}

// === Controladores ===
async function enviarMovimiento(idMov) {
  try {
    setStatus(CATALOGO[idMov]);
    await postMovimiento(idMov);
    showToast(`Enviado: ${CATALOGO[idMov]}`);
    await refrescarUltimo();
  } catch (e) {
    showToast(`Error: ${e.message}`);
  }
}

async function refrescarUltimo() {
  try {
    const { data } = await getUltimoMovimiento();
    if (data) {
      let id = Number(data.id_movimiento || data.movimiento);
      let nombre = CATALOGO[id] || data.movimiento;
      if (!id) {
        id = Object.keys(CATALOGO).find(k => CATALOGO[k] === data.movimiento);
      }
      
      // Formatear la fecha correctamente
      let fechaFormateada = "";
      if (data.fecha_hora) {
        const isoDate = data.fecha_hora.replace(' ', 'T');
        const dateObj = new Date(isoDate);
        fechaFormateada = dateObj.toLocaleString('es-ES', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      }
      
      setStatus(nombre, id, fechaFormateada);
    }
  } catch (e) {
    showToast(`No se pudo consultar el estatus: ${e.message}`);
  }
}

// === Eventos ===
document.querySelectorAll("[data-mov]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = Number(btn.dataset.mov);
    enviarMovimiento(id);
  });
});

// Atajos de teclado
document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === "w") enviarMovimiento(1);
  if (key === "s") enviarMovimiento(2);
  if (key === " ") enviarMovimiento(3);
  if (key === "e") enviarMovimiento(4);
  if (key === "q") enviarMovimiento(5);
  if (key === "c") enviarMovimiento(6);
  if (key === "z") enviarMovimiento(7);
  if (key === "d") enviarMovimiento(8);
  if (key === "a") enviarMovimiento(9);
  if (key === "x") enviarMovimiento(10);
  if (key === "y") enviarMovimiento(11);
});

// === Sistema de Wake Word "Atlas" MEJORADO con Buffer ===
let isListening = false;
let recognition = null;
let transcriptBuffer = '';
let bufferTimeout = null;
let lastProcessedTime = 0;

// Función mejorada para procesar comandos con buffer
function processVoiceCommand(transcript) {
  if (!transcript || transcript.trim().length < 2) {
    return;
  }

  console.log(`Texto detectado: "${transcript}"`);

  const currentTime = Date.now();
  
  // Si ha pasado más de 2 segundos desde el último procesamiento, reiniciar buffer
  if (currentTime - lastProcessedTime > 2000) {
    transcriptBuffer = '';
  }

  // Agregar al buffer
  transcriptBuffer += ' ' + transcript;
  transcriptBuffer = transcriptBuffer.trim();
  
  console.log(`Buffer actual: "${transcriptBuffer}"`);

  // Limpiar timeout anterior
  if (bufferTimeout) {
    clearTimeout(bufferTimeout);
  }

  // Configurar nuevo timeout para procesar el buffer
  bufferTimeout = setTimeout(() => {
    processBuffer();
  }, 800); // Esperar 800ms para ver si llega más texto
}

// Procesar el buffer completo
function processBuffer() {
  if (!transcriptBuffer) return;

  const normalizedTranscript = transcriptBuffer.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  console.log(`Procesando buffer: "${normalizedTranscript}"`);

  // Buscar la palabra de activación "atlas" en cualquier parte del texto
  const wakeWordIndex = normalizedTranscript.indexOf(WAKE_WORD);
  
  if (wakeWordIndex === -1) {
    // No se mencionó "Atlas", ignorar
    console.log('No se detectó la palabra "Atlas" en el buffer, ignorando');
    transcriptBuffer = '';
    return;
  }

  // Extraer todo lo que viene después de "atlas"
  let fullCommand = normalizedTranscript.substring(wakeWordIndex + WAKE_WORD.length)
    .replace(/^[\s,.\-]+/, '')
    .trim();

  if (!fullCommand) {
    // Solo se dijo "Atlas" sin comando
    updateVoiceUI(`${ASSISTANT_NAME} te escucha, ¿qué deseas?`, 'listening');
    playActivationSound();
    transcriptBuffer = '';
    lastProcessedTime = Date.now();
    return;
  }

  console.log(`Comando completo después de Atlas: "${fullCommand}"`);

  // Procesar el comando completo
  processCommand(fullCommand);
  
  // Limpiar buffer después de procesar
  transcriptBuffer = '';
  lastProcessedTime = Date.now();
}

// Función separada para procesar comandos
async function processCommand(command) {
  updateVoiceUI(`Procesando: "${command}"`, 'processing');
  
  try {
    let movimientoId = null;
    
    // Intentar con OpenAI si está disponible
    try {
      movimientoId = await interpretCommandWithOpenAI(command);
    } catch (openaiError) {
      console.warn('OpenAI falló, usando método manual:', openaiError);
      movimientoId = interpretCommandManually(command);
    }
    
    if (movimientoId) {
      const movimientoNombre = CATALOGO[movimientoId];
      updateVoiceUI(`${ASSISTANT_NAME}: ${movimientoNombre}`, 'success');
      showToast(`${ASSISTANT_NAME}: ${movimientoNombre}`);
      await enviarMovimiento(movimientoId);
      playConfirmationSound();
    } else {
      updateVoiceUI(`${ASSISTANT_NAME}: No entendí "${command}"`, 'error');
      showToast(`${ASSISTANT_NAME}: Comando no reconocido`);
      playErrorSound();
    }
    
    // Breve pausa antes de volver a escuchar
    setTimeout(() => {
      if (isListening) {
        updateVoiceUI(`Di "${ASSISTANT_NAME}" seguido de un comando`, 'listening');
      }
    }, 1500);
  } catch (error) {
    console.error('Error procesando comando de voz:', error);
    updateVoiceUI('Error procesando comando', 'error');
    showToast('Error con control por voz');
    playErrorSound();
  }
}

// Interpretar comando usando OpenAI
async function interpretCommandWithOpenAI(command) {
  // Si no tenemos la API key, intentar obtenerla
  if (!OPENAI_API_KEY) {
    try {
      OPENAI_API_KEY = await obtenerApiKey();
    } catch (error) {
      console.error("No se pudo obtener la API key, usando método manual");
      return interpretCommandManually(command);
    }
  }

  const improvedPrompt = `
Eres ${ASSISTANT_NAME}, un asistente especializado en controlar movimientos de robot. 
Analiza el comando de voz y devuelve SOLO el número correspondiente al movimiento.

COMANDO: "${command}"

INSTRUCCIONES:
1. Analiza el comando considerando variaciones del español y errores de transcripción
2. Ignora palabras irrelevantes como "por favor", "eh", etc.
3. Considera sinónimos y formas coloquiales
4. Si el comando no es claro, intenta adivinar la intención
5. Responde EXCLUSIVAMENTE con un número del 1 al 11 o "null"

CATÁLOGO:
1 "Adelante" → adelante, avanza, hacia adelante, ve adelante, forward, avance, anda adelante
2 "Atrás" → atrás, retrocede, hacia atrás, ve atrás, back, retroceda, reversa, marcha atrás
3 "Detener" → detente, para, alto, stop, párate, pare, deténgase, alto ahí, para ya
4 "Vuelta adelante derecha" → vuelta derecha adelante, giro adelante derecha, curva derecha adelante, vuelta a la derecha adelante
5 "Vuelta adelante izquierda" → vuelta izquierda adelante, giro adelante izquierda, curva izquierda adelante, vuelta a la izquierda adelante
6 "Vuelta atrás derecha" → vuelta atrás derecha, giro atrás derecha, retroceso derecha, vuelta a la derecha atrás
7 "Vuelta atrás izquierda" → vuelta atrás izquierda, giro atrás izquierda, retroceso izquierda, vuelta a la izquierda atrás
8 "Giro 90° derecha" → gira derecha, giro derecha, a la derecha, derecha, voltéate derecha, dobla derecha, noventa grados derecha
9 "Giro 90° izquierda" → gira izquierda, giro izquierda, a la izquierda, izquierda, voltéate izquierda, dobla izquierda, noventa grados izquierda
10 "Giro 360° derecha" → giro completo derecha, 360 derecha, vuelta completa derecha, rotación completa derecha, da vuelta derecha, giro redondo derecha
11 "Giro 360° izquierda" → giro completo izquierda, 360 izquierda, vuelta completa izquierda, rotación completa izquierda, da vuelta izquierda, giro redondo izquierda

IMPORTANTE: Distingue claramente entre:
- "Vuelta" (movimientos 4-7): son curvas mientras avanza/retrocede
- "Giro 90°" (movimientos 8-9): son giros en el lugar de 90 grados
- "Giro 360°" (movimientos 10-11): son giros completos de 360 grados

EJEMPLOS DE CORRECCIÓN:
- "de tener" → 3 (detener)
- "a delante" → 1 (adelante)
- "ira izquierda" → 9 (gira izquierda)
- "boltea derecha" → 8 (voltea derecha)
- "para el robot" → 3 (detener)
- "vuelta derecha" → 4 (vuelta adelante derecha)
- "giro completo izquierda" → 11 (giro 360° izquierda)
- "noventa grados derecha" → 8 (giro 90° derecha)

RESPUESTA (SOLO NÚMERO O "null"):
`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: improvedPrompt }],
        max_tokens: 10,
        temperature: 0.1
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Si hay error de autenticación, limpiar la API key para reintentar
      if (response.status === 401) {
        OPENAI_API_KEY = "";
        console.warn("API key inválida, limpiando caché");
      }
      throw new Error(`Error API OpenAI: ${response.status}`);
    }

    const data = await response.json();
    const result = data.choices[0].message.content.trim();
    
    console.log(`OpenAI respuesta: "${result}" para comando: "${command}"`);
    
    const movimientoId = parseMovementId(result);
    return movimientoId || interpretCommandManually(command);
  } catch (error) {
    console.error('Error con OpenAI:', error);
    return interpretCommandManually(command);
  }
}

// Función para parsear la respuesta de OpenAI
function parseMovementId(result) {
  const cleanResult = result.replace(/[^0-9]/g, '');
  if (cleanResult) {
    const id = parseInt(cleanResult);
    if (id >= 1 && id <= 11) {
      return id;
    }
  }
  
  const lowerResult = result.toLowerCase();
  if (lowerResult.includes('adelante')) return 1;
  if (lowerResult.includes('atrás') || lowerResult.includes('atras')) return 2;
  if (lowerResult.includes('detener') || lowerResult.includes('para')) return 3;
  
  return null;
}

// Método manual MEJORADO para distinguir mejor entre giros y vueltas
function interpretCommandManually(command) {
  const lowerCommand = command.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  console.log(`Procesando comando manualmente: "${lowerCommand}"`);
  
  // Corrección de errores comunes de transcripción MEJORADA
  const correctedCommand = lowerCommand
    .replace(/\bde tener\b/g, 'detener')
    .replace(/\ba delante\b/g, 'adelante')
    .replace(/\bira\b/g, 'gira')
    .replace(/\bboltea\b/g, 'voltea')
    .replace(/\bdobla\b/g, 'gira')
    .replace(/\bmarcha\s*atras\b/g, 'atrás')
    .replace(/\bpara\s+el\s+robot\b/g, 'detener')
    .replace(/\bpara\s+ya\b/g, 'detener')
    .replace(/\bnoventa\b/g, '90')
    .replace(/\btrescientos sesenta\b/g, '360')
    .replace(/\bcompleta\b/g, 'completo')
    .replace(/\bredondo\b/g, 'completo');

  if (correctedCommand !== lowerCommand) {
    console.log(`Comando corregido: "${correctedCommand}"`);
  }

  // Patrones MEJORADOS para distinguir mejor entre tipos de movimiento
  const commandPatterns = [
    // Movimientos básicos (primero los más comunes)
    { patterns: ['detente', 'detener', 'para', 'alto', 'stop', 'parate', 'frenar', 'frena', 'quieto', 'pare', 'detengase', 'alto ahi', 'para ya'], id: 3 },
    { patterns: ['adelante', 'avanza', 'avanzar', 'hacia adelante', 'para adelante', 've adelante', 'forward', 'avance', 'anda adelante'], id: 1 },
    { patterns: ['atras', 'atrás', 'retrocede', 'retroceder', 'hacia atras', 'para atras', 've atras', 'back', 'reversa', 'retroceda', 'marcha atras'], id: 2 },
    
    // Giro 360° (giros completos) - prioridad alta para evitar confusión con 90°
    { patterns: ['360 derecha', 'giro completo derecha', 'vuelta completa derecha', 'rotacion completo derecha', 'da vuelta derecha', 'giro redondo derecha', 'completo derecha'], id: 10 },
    { patterns: ['360 izquierda', 'giro completo izquierda', 'vuelta completa izquierda', 'rotacion completo izquierda', 'da vuelta izquierda', 'giro redondo izquierda', 'completo izquierda'], id: 11 },
    
    // Giro 90° (giros en el lugar)
    { patterns: ['90 derecha', 'giro 90 derecha', 'noventa grados derecha', 'gira derecha', 'giro derecha', 'volteate derecha'], id: 8 },
    { patterns: ['90 izquierda', 'giro 90 izquierda', 'noventa grados izquierda', 'gira izquierda', 'giro izquierda', 'volteate izquierda'], id: 9 },
    
    // Vueltas (curvas mientras se mueve)
    { patterns: ['vuelta adelante derecha', 'giro adelante derecha', 'curva derecha adelante', 'vuelta a la derecha adelante'], id: 4 },
    { patterns: ['vuelta adelante izquierda', 'giro adelante izquierda', 'curva izquierda adelante', 'vuelta a la izquierda adelante'], id: 5 },
    { patterns: ['vuelta atras derecha', 'vuelta atrás derecha', 'giro atras derecha', 'curva derecha atras', 'vuelta a la derecha atras'], id: 6 },
    { patterns: ['vuelta atras izquierda', 'vuelta atrás izquierda', 'giro atras izquierda', 'curva izquierda atras', 'vuelta a la izquierda atras'], id: 7 }
  ];

  // Buscar coincidencia exacta primero
  for (const { patterns, id } of commandPatterns) {
    for (const pattern of patterns) {
      if (correctedCommand === pattern) {
        return id;
      }
    }
  }

  // Búsqueda por palabras clave con prioridad MEJORADA
  const words = correctedCommand.split(' ');
  
  // Primero verificar giros 360° (palabras específicas)
  if (correctedCommand.includes('360') || correctedCommand.includes('completo') || correctedCommand.includes('redondo')) {
    if (correctedCommand.includes('derecha')) return 10;
    if (correctedCommand.includes('izquierda')) return 11;
  }
  
  // Luego verificar giros 90° (palabras específicas)
  if (correctedCommand.includes('90') || correctedCommand.includes('noventa')) {
    if (correctedCommand.includes('derecha')) return 8;
    if (correctedCommand.includes('izquierda')) return 9;
  }
  
  // Verificar vueltas (contexto de movimiento + dirección)
  if ((correctedCommand.includes('adelante') || correctedCommand.includes('avanza')) && 
      (correctedCommand.includes('derecha') || correctedCommand.includes('izquierda'))) {
    if (correctedCommand.includes('derecha')) return 4;
    if (correctedCommand.includes('izquierda')) return 5;
  }
  
  if ((correctedCommand.includes('atras') || correctedCommand.includes('retrocede')) && 
      (correctedCommand.includes('derecha') || correctedCommand.includes('izquierda'))) {
    if (correctedCommand.includes('derecha')) return 6;
    if (correctedCommand.includes('izquierda')) return 7;
  }
  
  // Buscar coincidencia parcial para casos más complejos
  for (const { patterns, id } of commandPatterns) {
    for (const pattern of patterns) {
      const patternWords = pattern.split(' ');
      const matchCount = patternWords.filter(word => correctedCommand.includes(word)).length;
      
      // Requerir al menos 60% de coincidencia y al menos 2 palabras
      if (matchCount >= Math.max(2, Math.ceil(patternWords.length * 0.6))) {
        console.log(`Coincidencia parcial encontrada: ${pattern} -> ${id}`);
        return id;
      }
    }
  }

  // Búsqueda final de palabras clave individuales (solo para movimientos básicos)
  for (const word of words) {
    if (['adelante', 'avanza', 'avanzar', 'avance'].includes(word)) return 1;
    if (['atras', 'atrás', 'retrocede', 'retroceder', 'retroceda'].includes(word)) return 2;
    if (['para', 'detente', 'alto', 'stop', 'pare', 'frena'].includes(word)) return 3;
    // NOTA: No incluimos "derecha" e "izquierda" solas para evitar confusiones
  }

  return null;
}

// Sonidos de feedback
function playConfirmationSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {
    console.log('Audio context no disponible');
  }
}

function playActivationSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 600;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (e) {
    console.log('Audio context no disponible');
  }
}

function playErrorSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 400;
    oscillator.type = 'sawtooth';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (e) {
    console.log('Audio context no disponible');
  }
}

// Inicializar reconocimiento de voz MEJORADO con buffer
function initSpeechRecognition() {
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'es-ES';
    recognition.maxAlternatives = 3;

    recognition.onstart = function() {
      transcriptBuffer = '';
      lastProcessedTime = Date.now();
      updateVoiceUI('Escuchando... Di "Atlas" seguido de un comando', 'listening');
    };

    recognition.onresult = function(event) {
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        }
      }
      
      // Procesar solo cuando hay resultado final
      if (finalTranscript.trim()) {
        console.log('Texto final detectado:', finalTranscript.trim());
        processVoiceCommand(finalTranscript.trim());
      }
    };

    recognition.onerror = function(event) {
      console.error('Error en reconocimiento de voz:', event.error);
      
      const errorMessages = {
        'no-speech': 'No se detectó voz. Intenta de nuevo.',
        'audio-capture': 'No se pudo acceder al micrófono.',
        'not-allowed': 'Permiso de micrófono denegado.',
        'network': 'Error de red. Verifica tu conexión.',
        'aborted': 'Reconocimiento abortado.'
      };
      
      const message = errorMessages[event.error] || `Error: ${event.error}`;
      updateVoiceUI(message, 'error');
      
      // Reiniciar después de error recuperable
      if (['no-speech', 'audio-capture', 'network'].includes(event.error)) {
        setTimeout(() => {
          if (isListening && recognition) {
            try {
              recognition.start();
            } catch (e) {
              console.error('Error al reiniciar reconocimiento:', e);
            }
          }
        }, 2000);
      } else {
        stopVoiceControl();
      }
    };

    recognition.onend = function() {
      console.log('Reconocimiento de voz finalizado');
      // Limpiar buffer cuando termina el reconocimiento
      if (bufferTimeout) {
        clearTimeout(bufferTimeout);
      }
      transcriptBuffer = '';
      
      // Si aún estamos escuchando, reiniciar el reconocimiento
      if (isListening) {
        setTimeout(() => {
          if (isListening && recognition) {
            try {
              recognition.start();
            } catch (e) {
              console.error('Error al reiniciar reconocimiento:', e);
            }
          }
        }, 100);
      }
    };
  } else {
    console.warn('El reconocimiento de voz no está soportado en este navegador');
    updateVoiceUI('Navegador no compatible con reconocimiento de voz', 'error');
  }
}

// Actualizar UI de control por voz
function updateVoiceUI(message, state = 'idle') {
  if (!voiceText) return;
  
  voiceText.textContent = message;
  
  // Reset classes
  voiceIndicator.className = 'speech-indicator';
  voiceControlBtn.className = 'btn btn-lg';
  if (voiceStatus) voiceStatus.className = 'voice-feedback';
  
  switch (state) {
    case 'listening':
      voiceIndicator.classList.add('listening');
      voiceControlBtn.classList.add('btn-danger');
      if (voiceStatus) voiceStatus.classList.add('listening');
      voiceControlBtn.innerHTML = '<i class="bi bi-mic-fill me-2"></i>Detener Asistente';
      break;
    case 'processing':
      voiceIndicator.classList.add('processing');
      voiceControlBtn.classList.add('btn-warning');
      if (voiceStatus) voiceStatus.classList.add('processing');
      voiceControlBtn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Procesando...';
      break;
    case 'success':
      voiceIndicator.classList.add('success');
      voiceControlBtn.classList.add('btn-success');
      if (voiceStatus) voiceStatus.classList.add('success');
      break;
    case 'error':
      voiceIndicator.classList.add('error');
      voiceControlBtn.classList.add('btn-danger');
      if (voiceStatus) voiceStatus.classList.add('error');
      break;
    default:
      voiceControlBtn.classList.add('btn-primary');
      if (voiceStatus) voiceStatus.classList.remove('listening', 'processing', 'success', 'error');
      voiceControlBtn.innerHTML = '<i class="bi bi-mic-fill me-2"></i>Activar Asistente por Voz';
  }
}

// Iniciar control por voz
function startVoiceControl() {
  if (!recognition) {
    initSpeechRecognition();
  }
  
  isListening = true;
  transcriptBuffer = '';
  lastProcessedTime = Date.now();
  
  if (recognition) {
    try {
      recognition.start();
    } catch (e) {
      console.error('Error al iniciar reconocimiento:', e);
      updateVoiceUI('Error al iniciar micrófono', 'error');
      isListening = false;
    }
  }
}

// Detener control por voz
function stopVoiceControl() {
  isListening = false;
  transcriptBuffer = '';
  
  if (bufferTimeout) {
    clearTimeout(bufferTimeout);
    bufferTimeout = null;
  }
  
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {
      console.error('Error al detener reconocimiento:', e);
    }
  }
  updateVoiceUI('Asistente desactivado', 'idle');
}

// Event listener para el botón de voz
if (voiceControlBtn) {
  voiceControlBtn.addEventListener('click', () => {
    if (isListening) {
      stopVoiceControl();
    } else {
      startVoiceControl();
    }
  });
}

// Atajo de teclado para voz (V)
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'v' && !isListening) {
    startVoiceControl();
    e.preventDefault();
  }
});

// === Monitoreo ===
const MONITOR_N = 10;
const MONITOR_MS = 2000;
let monitorTimer = null;

async function getUltimosMovimientos(n = MONITOR_N) {
  const url = `${API_BASE}/movimientos/ultimos?n=${encodeURIComponent(n)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error HTTP ${res.status}`);
  }
  return res.json();
}

// === Render de tabla - Versión robusta ===
function renderTablaMovs(rows) {
  const tbody = document.getElementById("tabla-movs");
  if (!tbody) return;
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Sin datos</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((r) => {
    const id = r.id ?? "";
    const nombre = r.movimiento ?? r.movimiento_nombre ?? "";
    
    // Función para formatear fecha desde MySQL
    const formatMySQLDate = (mysqlDate) => {
      if (!mysqlDate) return "";
      
      try {
        // Intentar diferentes métodos de parsing
        let dateObj;
        
        // Método 1: Formato MySQL estándar 'YYYY-MM-DD HH:MM:SS'
        if (mysqlDate.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
          const [datePart, timePart] = mysqlDate.split(' ');
          const [year, month, day] = datePart.split('-');
          const [hours, minutes, seconds] = timePart.split(':');
          
          dateObj = new Date(
            parseInt(year), 
            parseInt(month) - 1, 
            parseInt(day), 
            parseInt(hours), 
            parseInt(minutes), 
            parseInt(seconds)
          );
        }
        // Método 2: Convertir a formato ISO
        else if (mysqlDate.includes(' ')) {
          const isoDate = mysqlDate.replace(' ', 'T');
          dateObj = new Date(isoDate);
        }
        // Método 3: Usar parsing directo
        else {
          dateObj = new Date(mysqlDate);
        }
        
        // Verificar si la fecha es válida
        if (isNaN(dateObj.getTime())) {
          console.warn('Fecha inválida:', mysqlDate);
          return mysqlDate; // Devolver el string original si no se puede parsear
        }
        
        // Formatear a español
        return dateObj.toLocaleString('es-ES', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        
      } catch (error) {
        console.error('Error formateando fecha:', error);
        return mysqlDate; // Devolver el string original en caso de error
      }
    };
    
    const fecha = formatMySQLDate(r.fecha_hora);
    
    return `<tr>
      <td class="text-nowrap">${id}</td>
      <td class="text-nowrap">${nombre}</td>
      <td class="text-nowrap">${fecha}</td>
    </tr>`;
  }).join("");
}

async function updateMonitorOnce() {
  try {
    const ultimos = await getUltimosMovimientos(MONITOR_N);
    const rows = ultimos?.data ?? ultimos;
    renderTablaMovs(rows);
    await refrescarUltimo();
    
    const foot = document.getElementById("monitor-foot");
    if (foot) {
      foot.textContent = `Actualización automática cada 2s | Última actualización: ${new Date().toLocaleTimeString()}`;
    }
  } catch (e) {
    showToast(`Error de monitoreo: ${e.message}`);
    const foot = document.getElementById("monitor-foot");
    if (foot) foot.textContent = `Error: ${e.message}`;
  }
}

function startMonitor() {
  if (monitorTimer) return;
  
  updateMonitorOnce();
  monitorTimer = setInterval(updateMonitorOnce, MONITOR_MS);

  const foot = document.getElementById("monitor-foot");
  if (foot) foot.textContent = `Actualización automática cada 2s | Última actualización: ${new Date().toLocaleTimeString()}`;
}

// === Iniciar aplicación ===
window.addEventListener("DOMContentLoaded", async () => {
  await refrescarUltimo();
  startMonitor();
  // Pre-cargar la API key en segundo plano
  preloadApiKey();

});


