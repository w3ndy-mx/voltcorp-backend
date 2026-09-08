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
