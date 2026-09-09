const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Caché temporal en memoria
const memoriaCache = {};

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
            `[GROQ]: Analizando '${nombrePieza}'...`
        );

        // --------------------------------------------------
        // Comprobar API KEY
        // --------------------------------------------------

        if (!GROQ_API_KEY) {
            throw new Error(
                "GROQ_API_KEY no está definida en Environment Variables."
            );
        }

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
        // Petición a Groq
        // --------------------------------------------------

        const response = await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${GROQ_API_KEY.trim()}`
                },

                body: JSON.stringify({

                    // MODELO ACTUAL
                    model: "openai/gpt-oss-120b",

                    messages: [
                        {
                            role: "system",
                            content:
                                "You are a JSON-only assistant. Return valid JSON and nothing else."
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],

                    // Groq JSON mode
                    response_format: {
                        type: "json_object"
                    },

                    temperature: 0.2,

                    max_completion_tokens: 1000
                })
            }
        );

        // --------------------------------------------------
        // Comprobar respuesta HTTP
        // --------------------------------------------------

        if (!response.ok) {

            const errorDetails =
                await response.text();

            throw new Error(
                `Groq HTTP ${response.status}: ${errorDetails}`
            );
        }

        // --------------------------------------------------
        // Obtener respuesta
        // --------------------------------------------------

        const data = await response.json();

        const rawText =
            data?.choices?.[0]?.message?.content?.trim();

        if (!rawText) {
            throw new Error(
                "Groq no devolvió contenido."
            );
        }

        // --------------------------------------------------
        // Convertir JSON
        // --------------------------------------------------

        let datosPieza;

        try {

            datosPieza =
                JSON.parse(rawText);

        } catch (parseErr) {

            console.error(
                "JSON recibido de Groq:",
                rawText
            );

            throw new Error(
                "Groq devolvió un JSON inválido."
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
// INICIAR SERVIDOR
// ======================================================

const PORT =
    process.env.PORT || 10000;

app.listen(PORT, () => {

    console.log(
        `Servidor escuchando en puerto ${PORT}`
    );

});
