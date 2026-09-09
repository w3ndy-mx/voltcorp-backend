const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// --------------------------------------------------
// CONFIGURACIÓN DE PROVEEDOR DE IA
// --------------------------------------------------
// AI_PROVIDER = "groq"   -> usa Groq (recomendado en Render / producción)
// AI_PROVIDER = "ollama" -> usa Ollama local (recomendado en desarrollo)
// Si no se define, por defecto usa "groq".
const AI_PROVIDER = (process.env.AI_PROVIDER || "groq").toLowerCase();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1";

// Caché temporal en memoria
const memoriaCache = {};

// Caché de "piezas del día" (se regenera 1 vez cada 24h, no en cada visita)
let cachePiezasDelDia = {
    fecha: null,
    datos: null
};

// ======================================================
// CATÁLOGO DE COMPONENTES (catalogo-componentes.json)
// ======================================================
// Se carga UNA vez al iniciar el servidor, en memoria.
// No usa IA: es el catálogo estructurado y curado que
// alimenta el buscador y los filtros de la página.

let catalogoComponentes = [];

function cargarCatalogo() {
    try {
        const rutaArchivo = path.join(__dirname, 'catalogo-componentes.json');
        const contenido = fs.readFileSync(rutaArchivo, 'utf-8');
        const datos = JSON.parse(contenido);

        catalogoComponentes = Array.isArray(datos.componentes) ? datos.componentes : [];

        console.log(`[CATÁLOGO]: ${catalogoComponentes.length} componentes cargados desde catalogo-componentes.json.`);
    } catch (error) {
        console.error('[CATÁLOGO]: No se pudo cargar catalogo-componentes.json:', error.message);
        catalogoComponentes = [];
    }
}

// Cargar el catálogo apenas arranca el servidor
cargarCatalogo();

// ======================================================
// FUNCIONES DE IA (GROQ / OLLAMA)
// ======================================================

// --------------------------------------------------
// Llamada a Groq (producción / Render)
// --------------------------------------------------
async function llamarGroq(mensajes) {

    if (!GROQ_API_KEY) {
        throw new Error(
            "GROQ_API_KEY no está definida en Environment Variables."
        );
    }

    const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY.trim()}`
            },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                messages: mensajes,
                response_format: { type: "json_object" },
                temperature: 0.4,
                max_completion_tokens: 1500
            })
        }
    );

    if (!response.ok) {
        const errorDetails = await response.text();
        throw new Error(`Groq HTTP ${response.status}: ${errorDetails}`);
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content?.trim();

    if (!rawText) {
        throw new Error("Groq no devolvió contenido.");
    }

    return rawText;
}

// --------------------------------------------------
// Llamada a Ollama (desarrollo local)
// --------------------------------------------------
async function llamarOllama(mensajes) {

    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: mensajes,
            stream: false,
            format: "json"
        })
    });

    if (!response.ok) {
        const errorDetails = await response.text();
        throw new Error(`Ollama HTTP ${response.status}: ${errorDetails}`);
    }

    const data = await response.json();
    const rawText = data?.message?.content?.trim();

    if (!rawText) {
        throw new Error("Ollama no devolvió contenido.");
    }

    return rawText;
}

// --------------------------------------------------
// Selector de proveedor: usa el que esté configurado
// en AI_PROVIDER (groq por defecto, ollama si lo pides)
// --------------------------------------------------
async function llamarIA(mensajes) {

    if (AI_PROVIDER === "ollama") {
        console.log("[IA]: Usando OLLAMA (local) →", OLLAMA_MODEL);
        return await llamarOllama(mensajes);
    }

    console.log("[IA]: Usando GROQ (producción)");
    return await llamarGroq(mensajes);
}

// ======================================================
// API: OBTENER INFORMACIÓN DE UNA PIEZA
// ======================================================

app.get('/api/detalle', async (req, res) => {

    const nombrePieza = req.query.pieza;

    // --------------------------------------------------
    // Comprobar que se recibió una pieza
    // --------------------------------------------------

    if (!nombrePieza) {
        return res.status(400).json({
            error: "Falta el nombre de la pieza."
        });
    }

    const claveNormalizada = nombrePieza
        .toLowerCase()
        .trim();

    // --------------------------------------------------
    // Revisar caché
    // --------------------------------------------------

    if (memoriaCache[claveNormalizada]) {

        console.log(
            `[CACHÉ]: Recuperando '${nombrePieza}' desde memoria.`
        );

        return res.json(
            memoriaCache[claveNormalizada]
        );
    }

    try {

        console.log(
            `[IA]: Analizando '${nombrePieza}'...`
        );

        // --------------------------------------------------
        // Prompt para la IA
        // --------------------------------------------------

        const prompt = `
Analiza el siguiente componente de PC:

"${nombrePieza}"

Tu tarea es proporcionar información útil para una tienda
de componentes de computadora.

IMPORTANTE:
- No inventes especificaciones extremadamente específicas
  si no estás seguro.
- El stock es una ESTIMACIÓN ficticia para demostración.
- El stock debe ser un número entero entre 0 y 20.
- Si el stock es <= 5, esPiezaDelDia debe ser true.
- Si el stock es > 5, esPiezaDelDia debe ser false.
- Evalúa aproximadamente su capacidad para gaming en:
  1080p
  1440p
  4K

Devuelve EXCLUSIVAMENTE JSON válido.

La estructura debe ser exactamente:

{
    "especificaciones": "Resumen técnico corto.",
    "recomendacion": "Perfil de usuario recomendado.",
    "porqueComprar": "Argumento corto de valor.",
    "stock": 3,
    "esPiezaDelDia": true,
    "res": {
        "r1080": {
            "color": "dot-green",
            "texto": "Apta"
        },
        "r1440": {
            "color": "dot-orange",
            "texto": "Aceptable"
        },
        "r4k": {
            "color": "dot-red",
            "texto": "No apta"
        }
    }
}

Los valores permitidos para "color" son:

dot-green
dot-orange
dot-red
dot-gray

No escribas Markdown.
No escribas explicaciones fuera del JSON.
`;

        // --------------------------------------------------
        // Petición a la IA (Groq u Ollama según AI_PROVIDER)
        // --------------------------------------------------

        const rawText = await llamarIA([
            {
                role: "system",
                content:
                    "You are a JSON-only assistant. Return valid JSON and nothing else."
            },
            {
                role: "user",
                content: prompt
            }
        ]);

        // --------------------------------------------------
        // Convertir JSON
        // --------------------------------------------------

        let datosPieza;

        try {

            datosPieza =
                JSON.parse(rawText);

        } catch (parseErr) {

            console.error(
                "JSON recibido de la IA:",
                rawText
            );

            throw new Error(
                "La IA devolvió un JSON inválido."
            );
        }

        // --------------------------------------------------
        // Validar valores importantes
        // --------------------------------------------------

        if (
            typeof datosPieza.stock !== "number" ||
            datosPieza.stock < 0 ||
            datosPieza.stock > 20
        ) {

            datosPieza.stock = 5;
        }

        datosPieza.esPiezaDelDia =
            datosPieza.stock <= 5;

        // --------------------------------------------------
        // Añadir tiendas
        // --------------------------------------------------

        datosPieza.tiendas = [

            {
                nombre: "Amazon",
                precio: "Consultar oferta",
                url:
                    `https://www.amazon.com/s?k=${encodeURIComponent(
                        nombrePieza
                    )}`
            },

            {
                nombre: "Mercado Libre",
                precio: "Consultar oferta",
                url:
                    `https://listado.mercadolibre.com/${encodeURIComponent(
                        nombrePieza
                    )}`
            }

        ];

        // --------------------------------------------------
        // Guardar en caché
        // --------------------------------------------------

        memoriaCache[claveNormalizada] =
            datosPieza;

        // --------------------------------------------------
        // Responder al frontend
        // --------------------------------------------------

        return res.json(datosPieza);

    } catch (error) {

        console.error(
            "Error conectando con Groq:",
            error.message
        );

        // --------------------------------------------------
        // Respuesta de emergencia
        // --------------------------------------------------

        return res.status(500).json({

            especificaciones:
                "Sin datos disponibles.",

            recomendacion:
                `Error de API: ${error.message}`,

            porqueComprar:
                "N/A",

            stock: 0,

            esPiezaDelDia:
                false,

            res: {

                r1080: {
                    color: "dot-gray",
                    texto: "Sin datos"
                },

                r1440: {
                    color: "dot-gray",
                    texto: "Sin datos"
                },

                r4k: {
                    color: "dot-gray",
                    texto: "Sin datos"
                }

            },

            tiendas: []
        });
    }
});

// ======================================================
// API: PIEZAS DEL DÍA (elegidas por la IA)
// ======================================================

// Lista de respaldo por si la IA falla (misma forma que la respuesta real)
const PIEZAS_DEL_DIA_RESPALDO = [
    { categoria: "CPU", nombre: "AMD Ryzen 5 5600X", razon: "Excelente relación calidad-precio y muy alta demanda en builds gamer de gama media." },
    { categoria: "GPU", nombre: "NVIDIA RTX 4060 8GB", razon: "Gran eficiencia energética y soporte DLSS 3, una de las GPUs más buscadas del momento." },
    { categoria: "RAM", nombre: "Corsair Vengeance 16GB DDR4 3200MHz", razon: "Estándar de oro en estabilidad y precio muy competitivo por GB." },
    { categoria: "SSD", nombre: "Kingston NV2 1TB NVMe", razon: "Velocidades altas a un costo cercano al de unidades SATA tradicionales." },
    { categoria: "PSU", nombre: "EVGA 600W 80+ Bronze", razon: "Fuente confiable y económica, muy elegida para builds de gama media." }
];

function obtenerFechaHoy() {
    // Fecha en formato YYYY-MM-DD para saber si ya generamos hoy
    return new Date().toISOString().slice(0, 10);
}

app.get('/api/piezas-del-dia', async (req, res) => {

    const hoy = obtenerFechaHoy();

    // --------------------------------------------------
    // Si ya generamos hoy, devolver la caché (no regenerar
    // en cada visita, solo 1 vez cada 24h)
    // --------------------------------------------------

    if (cachePiezasDelDia.fecha === hoy && cachePiezasDelDia.datos) {

        console.log("[CACHÉ]: Devolviendo piezas del día ya generadas hoy.");

        return res.json(cachePiezasDelDia.datos);
    }

    try {

        console.log("[IA]: Generando nuevas piezas del día...");

        const prompt = `
Eres un experto en armado de PCs gamer y en el mercado actual de componentes.

Selecciona EXACTAMENTE 5 componentes, uno por cada categoría:
CPU, GPU, RAM, SSD y PSU (fuente de poder).

Criterios de selección (en este orden de importancia):
1. Mejor relación CALIDAD/PRECIO dentro de su categoría (gama media, buen rendimiento por dinero).
2. Alta DEMANDA/POPULARIDAD real entre compradores de PCs gamer actualmente.
3. Buena disponibilidad general en tiendas online.

Reglas importantes:
- Usa productos reales que existan en el mercado, con marca y modelo específico. No inventes modelos ficticios.
- No repitas siempre las mismas piezas: dentro de lo razonable, varía tu elección entre opciones vigentes similares en valor.
- La "razon" debe mencionar brevemente el motivo (precio, demanda, rendimiento, etc.), en una sola frase.

Devuelve EXCLUSIVAMENTE este JSON, sin texto adicional ni Markdown:

{
    "piezas": [
        { "categoria": "CPU", "nombre": "Marca y modelo exacto", "razon": "Frase corta del motivo." },
        { "categoria": "GPU", "nombre": "Marca y modelo exacto", "razon": "Frase corta del motivo." },
        { "categoria": "RAM", "nombre": "Marca y modelo exacto", "razon": "Frase corta del motivo." },
        { "categoria": "SSD", "nombre": "Marca y modelo exacto", "razon": "Frase corta del motivo." },
        { "categoria": "PSU", "nombre": "Marca y modelo exacto", "razon": "Frase corta del motivo." }
    ]
}
`;

        const rawText = await llamarIA([
            {
                role: "system",
                content: "You are a JSON-only assistant. Return valid JSON and nothing else."
            },
            {
                role: "user",
                content: prompt
            }
        ]);

        let resultado;

        try {
            resultado = JSON.parse(rawText);
        } catch (parseErr) {
            console.error("JSON recibido de la IA (piezas del día):", rawText);
            throw new Error("La IA devolvió un JSON inválido para piezas del día.");
        }

        let piezas = Array.isArray(resultado?.piezas) ? resultado.piezas : null;

        // Validación básica: deben ser 5 objetos con nombre y categoría
        const esValido =
            piezas &&
            piezas.length === 5 &&
            piezas.every(p => p && typeof p.nombre === "string" && typeof p.categoria === "string");

        if (!esValido) {
            console.warn("[IA]: Respuesta de piezas del día incompleta, usando respaldo.");
            piezas = PIEZAS_DEL_DIA_RESPALDO;
        }

        // --------------------------------------------------
        // Guardar en caché por el resto del día
        // --------------------------------------------------

        cachePiezasDelDia = {
            fecha: hoy,
            datos: piezas
        };

        return res.json(piezas);

    } catch (error) {

        console.error("Error generando piezas del día:", error.message);

        // Si falla la IA, devolvemos el respaldo (y NO lo guardamos en
        // caché, para reintentar generar con IA en la próxima visita)
        return res.json(PIEZAS_DEL_DIA_RESPALDO);
    }
});

// ======================================================
// API: BUSCAR / FILTRAR EN EL CATÁLOGO
// ======================================================
// GET /api/catalogo                        -> devuelve todo el catálogo
// GET /api/catalogo?q=ryzen                 -> busca por texto (nombre/marca/categoría)
// GET /api/catalogo?categoria=GPU           -> filtra por categoría exacta
// GET /api/catalogo?q=rtx&categoria=GPU     -> combina ambos filtros

app.get('/api/catalogo', (req, res) => {

    const busqueda = (req.query.q || '').toLowerCase().trim();
    const categoria = (req.query.categoria || '').toLowerCase().trim();

    let resultados = catalogoComponentes;

    if (categoria) {
        resultados = resultados.filter(
            componente => componente.categoria.toLowerCase() === categoria
        );
    }

    if (busqueda) {
        resultados = resultados.filter(componente => {
            const nombre = componente.nombre.toLowerCase();
            const marca = componente.marca.toLowerCase();
            const cat = componente.categoria.toLowerCase();

            return (
                nombre.includes(busqueda) ||
                marca.includes(busqueda) ||
                cat.includes(busqueda)
            );
        });
    }

    return res.json({
        total: resultados.length,
        componentes: resultados
    });
});



app.get('/api/catalogo/categorias', (req, res) => {

    const categorias = [...new Set(
        catalogoComponentes.map(componente => componente.categoria)
    )].sort();

    return res.json({ categorias });
});



const PORT =
    process.env.PORT || 10000;

app.listen(PORT, () => {

    console.log(
        `Servidor escuchando en puerto ${PORT}`
    );

});
