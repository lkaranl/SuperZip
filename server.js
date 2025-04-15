const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');
const { createObjectCsvWriter } = require('csv-writer');
const { execSync } = require('child_process');
const http = require('http');
const { Server } = require('socket.io');

// Inicializar app
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;

// Configurar middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function(req, file, cb) {
    // Adicionar timestamp para evitar conflitos, mas manter o nome original
    const uniqueSuffix = Date.now();
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // Limite de 100MB
});

// Configuração para registros CSV
const csvWriter = createObjectCsvWriter({
  path: 'results.csv',
  header: [
    { id: 'zipFile', title: 'Arquivo ZIP' },
    { id: 'zipFileOriginal', title: 'Nome Original ZIP' },
    { id: 'wordList', title: 'Word List' },
    { id: 'wordListOriginal', title: 'Nome Original Word List' },
    { id: 'language', title: 'Linguagem' },
    { id: 'executionTime', title: 'Tempo de Execução (ms)' },
    { id: 'result', title: 'Resultado' },
    { id: 'timestamp', title: 'Data/Hora' }
  ]
});

// Socket.IO para atualizações em tempo real
io.on('connection', (socket) => {
  console.log('Novo cliente conectado');
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado');
  });
});

// Rota para a página inicial
app.get('/', (req, res) => {
  res.render('index');
});

// Rota para upload de arquivos e iniciar o teste
app.post('/upload', upload.fields([
  { name: 'zipFile', maxCount: 1 },
  { name: 'wordList', maxCount: 1 }
]), async (req, res) => {
  try {
    const zipFilePath = req.files.zipFile[0].path;
    const wordListPath = req.files.wordList[0].path;
    const language = req.body.language;
    const socketId = req.body.socketId;
    const socket = io.sockets.sockets.get(socketId);

    // Guardar os nomes originais
    const zipFileOriginal = req.files.zipFile[0].originalname;
    const wordListOriginal = req.files.wordList[0].originalname;

    // Aqui implementaremos a lógica de teste de acordo com a linguagem selecionada
    let result = {};
    
    if (language === 'nodejs') {
      // Implementar chamada para o módulo Node.js
      const nodeJsModule = require('./modules/nodejs/zipCracker');
      
      // Registrar eventos de progresso
      const progressHandler = (progress, remainingTime, currentWord) => {
        if (socket) {
          socket.emit('progress', { progress, remainingTime, currentWord });
        }
      };
      
      result = await nodeJsModule.crackZip(zipFilePath, wordListPath, progressHandler);
    } else if (language === 'cpp') {
      // Implementar chamada para o módulo C++ (via wrapper)
      const cppModule = require('./modules/cpp/wrapper');
      result = await cppModule.crackZip(zipFilePath, wordListPath);
    } else {
      result = { error: 'Linguagem não suportada' };
    }

    // Registrar resultado no CSV
    if (!result.error) {
      await csvWriter.writeRecords([{
        zipFile: path.basename(zipFilePath),
        zipFileOriginal: zipFileOriginal,
        wordList: path.basename(wordListPath),
        wordListOriginal: wordListOriginal,
        language: language,
        executionTime: result.executionTime,
        result: result.password || 'Não encontrado',
        timestamp: new Date().toISOString()
      }]);
    }

    // Adicionar nomes originais ao resultado
    result.zipFileOriginal = zipFileOriginal;
    result.wordListOriginal = wordListOriginal;

    res.json(result);
  } catch (error) {
    console.error('Erro:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rota para obter resultados anteriores
app.get('/results', async (req, res) => {
  try {
    if (fs.existsSync('results.csv')) {
      const results = await fs.promises.readFile('results.csv', 'utf8');
      res.send(results);
    } else {
      res.json([]);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Iniciar o servidor
server.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
}); 