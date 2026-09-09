const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Configuración de la URL de Ollama mediante variables de entorno
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
        console.log(`[OLLAMA BÚSQUEDA]: Analizando stock e información para '${nombrePieza}'...`);
        
        const prompt = `
        Analiza el componente de PC: "${nombrePieza}".
        Estima un número de stock disponible en inventario (un número entero entre 0 y 20). Si el stock es menor o igual a 5, considérala "pieza del día" por ser de alta demanda/pocas unidades.

        Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
        {
            "especificaciones": "Resumen técnico corto.",
            "recomendacion": "Perfil recomendado.",
            "porqueComprar": "Argumento de valor.",
            "stock": 3,
            "esPiezaDelDia": true,
            "res": {
                "r1080": { "color": "dot-green", "texto": "Apta" },
                "r1440": { "color": "dot-orange", "texto": "Aceptable" },
                "r4k": { "color": "dot-red", "texto": "No apta" }
            }
        }
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

        if (!response.ok) throw new Error(`Ollama respondió con estado: ${response.status}`);

        const data = await response.json();
        
        let rawText = data.response.trim();
        rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

        let datosPieza;
        try {
            datosPieza = JSON.parse(rawText);
        } catch (parseErr) {
            datosPieza = {
                especificaciones: `Componente ${nombrePieza} para ensambles modernos.`,
                recomendacion: "Ideal para gaming y trabajo.",
                porqueComprar: "Buena relación costo-beneficio.",
                stock: 5,
                esPiezaDelDia: true,
                res: {
                    r1080: { color: "dot-green", texto: "Apta" },
                    r1440: { color: "dot-orange", texto: "Aceptable" },
                    r4k: { color: "dot-gray", texto: "N/A" }
                }
            };
        }

        // Corrección de las URLs encodeadas
        datosPieza.tiendas = [
            { nombre: "Amazon", precio: "Consultar oferta", url: `[https://www.amazon.com/s?k=$](https://www.amazon.com/s?k=$){encodeURIComponent(nombrePieza)}` },
            { nombre: "Mercado Libre", precio: "Consultar oferta", url: `[https://listado.mercadolibre.com/$](https://listado.mercadolibre.com/$){encodeURIComponent(nombrePieza)}` }
        ];

        memoriaCache[claveNormalizada] = datosPieza;
        return res.json(datosPieza);

    } catch (error) {
        console.error("Error conectando con Ollama:", error.message);
        return res.json({
            especificaciones: "Sin datos disponibles.",
            recomendacion: "Revisar conexión a Ollama.",
            porqueComprar: "N/A",
            stock: 0,
            esPiezaDelDia: false,
            res: {
                r1080: { color: "dot-gray", texto: "Sin datos" },
                r1440: { color: "dot-gray", texto: "Sin datos" },
                r4k: { color: "dot-gray", texto: "Sin datos" }
            },
            tiendas: []
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));
