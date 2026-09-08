const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Tus rutas aquí...
app.get('/', (req, res) => {
    res.send('Servidor activo');
});

// CRÍTICO PARA RENDER: Usar process.env.PORT
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

// Inicializar la API de Gemini (Asegúrate de configurar tu API Key en las variables de entorno)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "TU_API_KEY_AQUI");

// --- MEMORIA CACHÉ LOCAL ---
// Guarda las piezas procesadas para no repetir consultas a la IA
const memoriaCache = {};

app.get('/api/detalle', async (req, res) => {
    const nombrePieza = req.query.pieza;

    if (!nombrePieza) {
        return res.status(400).json({ error: "Falta el nombre de la pieza." });
    }

    const claveNormalizada = nombrePieza.toLowerCase().trim();

    // 1. VERIFICAR SI YA ESTÁ GUARDADA EN CACHÉ
    if (memoriaCache[claveNormalizada]) {
        console.log(`[CACHÉ]: Recuperando '${nombrePieza}' sin usar API de IA.`);
        return res.json(memoriaCache[claveNormalizada]);
    }

    // 2. SI NO ESTÁ EN CACHÉ, CONSULTAR A LA IA
    try {
        console.log(`[IA BÚSQUEDA]: Analizando '${nombrePieza}' por primera vez...`);
        
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
        Analiza el siguiente componente de hardware de PC: "${nombrePieza}".
        
        Devuelve EXCLUSIVAMENTE un objeto JSON válido con la siguiente estructura (sin texto extra, ni bloques de código markdown):

        {
            "especificaciones": "Resumen técnico corto y al grano sobre sus características clave.",
            "recomendacion": "Para qué tipo de uso o perfil de usuario se recomienda.",
            "porqueComprar": "Un argumento convincente sobre su relación precio-rendimiento o fiabilidad.",
            "res": {
                "r1080": {
                    "color": "dot-green | dot-orange | dot-red | dot-gray",
                    "texto": "Explicación corta (ej: Apta - 120 FPS, Decente con DLSS, No Apta, o Sin impacto directo si es RAM/SSD)"
                },
                "r1440": {
                    "color": "dot-green | dot-orange | dot-red | dot-gray",
                    "texto": "Explicación corta"
                },
                "r4k": {
                    "color": "dot-green | dot-orange | dot-red | dot-gray",
                    "texto": "Explicación corta"
                }
            },
            "tiendas": [
                { "nombre": "Amazon", "precio": "Consultar oferta", "url": "https://www.amazon.com/s?k=${encodeURIComponent(nombrePieza)}" },
                { "nombre": "Mercado Libre", "precio": "Consultar oferta", "url": "https://listado.mercadolibre.com/${encodeURIComponent(nombrePieza)}" }
            ]
        }

        Reglas para los colores de resolución:
        - dot-green: La pieza es completamente apta o rinde excelente en esa resolución.
        - dot-orange: La pieza puede correr en esa resolución pero con ajustes medios/bajos o reescalado.
        - dot-red: La pieza no es apta o sufre un cuello de botella grave en esa resolución.
        - dot-gray: Para componentes donde la resolución no aplica directamente (ej. SSD, Memoria RAM, Fuente de Poder, Gabinete, Disipador).
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();
        
        // Limpiar el texto en caso de que la IA responda dentro de bloques de código markdown ```json ... ```
        const jsonLimpio = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        const datosPieza = JSON.parse(jsonLimpio);

        // 3. GUARDAR EL RESULTADO EN LA CACHÉ
        memoriaCache[claveNormalizada] = datosPieza;

        return res.json(datosPieza);

    } catch (error) {
        console.error("Error al consultar la IA:", error);
        return res.status(500).json({ error: "No se pudo obtener información de la pieza." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor iniciado en puerto ${PORT}`);
});
