const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate";
const MODELO_OLLAMA = process.env.OLLAMA_MODEL || "llama3.2";

const memoriaCache = {};

app.get('/api/detalle', async (req, res) => {
    const nombrePieza = req.query.pieza;

    if (!nombrePieza) {
        return res.status(400).json({ error: "Falta el nombre de la pieza." });
    }

    const claveNormalizada = nombrePieza.toLowerCase().trim();

    if (memoriaCache[claveNormalizada]) {
        console.log(`[CACHÉ]: Recuperando '${nombrePieza}' desde la memoria local.`);
        return res.json(memoriaCache[claveNormalizada]);
    }

    try {
        console.log(`[OLLAMA BÚSQUEDA]: Analizando '${nombrePieza}' con ${MODELO_OLLAMA}...`);
        
        const prompt = `
        Analiza el componente de PC: "${nombrePieza}".
        Responde ÚNICAMENTE con un objeto JSON sin markdown con esta estructura exacta:
        {
            "especificaciones": "Resumen técnico corto sobre sus características clave.",
            "recomendacion": "Perfil de usuario recomendado.",
            "porqueComprar": "Argumento de relación precio-rendimiento.",
            "res": {
                "r1080": { "color": "dot-green", "texto": "Apta" },
                "r1440": { "color": "dot-orange", "texto": "Aceptable" },
                "r4k": { "color": "dot-red", "texto": "No apta" }
            }
        }
        Reglas para "color": "dot-green", "dot-orange", "dot-red", o "dot-gray" (si no aplica la resolución como RAM/SSD/Fuente/Gabinete).
        `;

        const response = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODELO_OLLAMA,
                prompt: prompt,
                stream: false,
                format: "json"
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama respondió con estado: ${response.status}`);
        }

        const data = await response.json();
        
        // --- LIMPIEZA DEL JSON DEVUELTO POR OLLAMA ---
        let rawText = data.response.trim();
        rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

        let datosPieza;
        try {
            datosPieza = JSON.parse(rawText);
        } catch (parseErr) {
            console.error("Error al parsear el JSON de Ollama:", parseErr);
            console.log("Texto recibido:", rawText);
            
            // Fallback en caso de que Llama 3.2 devuelva un formato deformado
            datosPieza = {
                especificaciones: `Componente ${nombrePieza} con arquitectura optimizada para ensambles modernos.`,
                recomendacion: "Ideal para integrarse en builds gaming y de trabajo general.",
                porqueComprar: "Excelente relación costo-beneficio y compatibilidad estándar.",
                res: {
                    r1080: { color: "dot-green", texto: "Apta" },
                    r1440: { color: "dot-orange", texto: "Evaluación media" },
                    r4k: { color: "dot-gray", texto: "Depende del conjunto" }
                }
            };
        }

        // Añadir las tiendas por defecto
        datosPieza.tiendas = [
            { nombre: "Amazon", precio: "Consultar oferta", url: `[https://www.amazon.com/s?k=$](https://www.amazon.com/s?k=$){encodeURIComponent(nombrePieza)}` },
            { nombre: "Mercado Libre", precio: "Consultar oferta", url: `[https://listado.mercadolibre.com/$](https://listado.mercadolibre.com/$){encodeURIComponent(nombrePieza)}` }
        ];

        // Guardar en la caché
        memoriaCache[claveNormalizada] = datosPieza;

        return res.json(datosPieza);

    } catch (error) {
        console.error("Error conectando con Ollama:", error.message);
        
        // Evitar pantalla en blanco respondiendo con un objeto válido de contingencia
        const fallbackRespuesta = {
            especificaciones: "Información procesada temporalmente fuera de línea.",
            recomendacion: "Verifica que el servicio de Ollama esté corriendo en segundo plano.",
            porqueComprar: "Consulte especificaciones directas del fabricante.",
            res: {
                r1080: { color: "dot-gray", texto: "Sin datos" },
                r1440: { color: "dot-gray", texto: "Sin datos" },
                r4k: { color: "dot-gray", texto: "Sin datos" }
            },
            tiendas: [
                { nombre: "Amazon", precio: "Consultar", url: `[https://www.amazon.com/s?k=$](https://www.amazon.com/s?k=$){encodeURIComponent(nombrePieza)}` },
                { nombre: "Mercado Libre", precio: "Consultar", url: `[https://listado.mercadolibre.com/$](https://listado.mercadolibre.com/$){encodeURIComponent(nombrePieza)}` }
            ]
        };

        return res.json(fallbackRespuesta);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor iniciado en el puerto ${PORT}`);
});
