require('dotenv').config();

const express = require('express');
const path = require('path');
const app = require('./app');
const { startScheduler } = require('./services/emailScheduler');

const PORT = process.env.PORT || 3001;

// 🔥 CORREÇÃO AQUI (subir 2 níveis)
const FRONTEND_PATH = path.join(__dirname, '..', '..', 'frontend');

// Servir ficheiros estáticos
app.use(express.static(FRONTEND_PATH));

// Página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_PATH, 'alojamento_local.html'));
});

const server = app.listen(PORT, () => {
  console.log(`✅ Santa Paciência Backend a correr na porta ${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  startScheduler();
});

server.on('error', (error) => {
  console.error('❌ Erro no servidor:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Erro não tratado:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Promise rejeitada:', reason);
});