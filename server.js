const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY;

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
        console.log(`[GROQ BÚSQUEDA]: Analizando stock e información para '${nombrePieza}'...`);

        if (!GROQ_API_KEY) {
            throw new Error("GROQ_API_KEY no definida en Environment Variables.");
        }

        const prompt = `
        Analiza el componente de PC: "${nombrePieza}".
        Estima un número de stock disponible en inventario (un número entero entre 0 y 20). Si el stock es menor o igual a 5, considérala "pieza del día" por ser de alta demanda/pocas unidades.

        Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta (sin texto ni Markdown adicional):
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

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY.trim()}`
            },
            body: JSON.stringify({
                model: "llama3-8b-8192",
                messages: [
                    { role: "system", content: "You are a JSON assistant. Respond ONLY in valid JSON format." },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            const errorDetails = await response.text();
            throw new Error(`Groq HTTP ${response.status}: ${errorDetails}`);
        }

        const data = await response.json();
        const rawText = data.choices[0].message.content.trim();

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

        datosPieza.tiendas = [
            { nombre: "Amazon", precio: "Consultar oferta", url: `https://www.amazon.com/s?k=${encodeURIComponent(nombrePieza)}` },
            { nombre: "Mercado Libre", precio: "Consultar oferta", url: `https://listado.mercadolibre.com/${encodeURIComponent(nombrePieza)}` }
        ];

        memoriaCache[claveNormalizada] = datosPieza;
        return res.json(datosPieza);

    } catch (error) {
        console.error("Error conectando con Groq:", error.message);
        return res.json({
            especificaciones: "Sin datos disponibles.",
            recomendacion: `Error de API: ${error.message}`,
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));
