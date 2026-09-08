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
        Analiza el siguiente componente de hardware de PC: "${nombrePieza}".
        
        Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin texto antes o después, ni bloques markdown):

        {
            "especificaciones": "Resumen técnico corto y al grano sobre sus características clave.",
            "recomendacion": "Para qué tipo de uso o perfil de usuario se recomienda.",
            "porqueComprar": "Un argumento convincente sobre su relación precio-rendimiento o fiabilidad.",
            "res": {
                "r1080": {
                    "color": "dot-green",
                    "texto": "Explicación corta"
                },
                "r1440": {
                    "color": "dot-orange",
                    "texto": "Explicación corta"
                },
                "r4k": {
                    "color": "dot-red",
                    "texto": "Explicación corta"
                }
            }
        }

        Reglas de asignación para la propiedad "color":
        - Usar "dot-green" si la pieza es excelente para esa resolución.
        - Usar "dot-orange" si es aceptable con ajustes o reescalado.
        - Usar "dot-red" si no es apta para esa resolución.
        - Usar "dot-gray" si la resolución no le afecta directamente (ej. RAM, SSD, Fuente de poder, Gabinete).
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
            throw new Error(`Error en la respuesta de Ollama: ${response.statusText}`);
        }

        const data = await response.json();
        const datosPieza = JSON.parse(data.response);

     
        datosPieza.tiendas = [
            { nombre: "Amazon", precio: "Consultar oferta", url: `https://www.amazon.com/s?k=${encodeURIComponent(nombrePieza)}` },
            { nombre: "Mercado Libre", precio: "Consultar oferta", url: `https://listado.mercadolibre.com/${encodeURIComponent(nombrePieza)}` }
        ];

    
        memoriaCache[claveNormalizada] = datosPieza;

        return res.json(datosPieza);

    } catch (error) {
        console.error("Error conectando con Ollama:", error);
        return res.status(500).json({ error: "No se pudo procesar la solicitud con Ollama." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor iniciado en el puerto ${PORT}`);
});
