const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const OLLAMA_URL = process.env.OLLAMA_URL
