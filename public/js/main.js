// Conectar ao servidor via Socket.IO
const socket = io();
let socketId = null;

// Obter o ID do socket
socket.on('connect', () => {
  socketId = socket.id;
  console.log('Conectado ao servidor com ID:', socketId);
});

// Elementos do DOM
const uploadForm = document.getElementById('upload-form');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const progressInfo = document.getElementById('progress-info');
const timeRemaining = document.getElementById('time-remaining');
const resultContainer = document.getElementById('result-container');
const resultSuccess = document.getElementById('result-success');
const resultFailure = document.getElementById('result-failure');
const passwordFound = document.getElementById('password-found');
const executionTime = document.getElementById('execution-time');
const testedWords = document.getElementById('tested-words');
const totalWords = document.getElementById('total-words');
const resultsTable = document.querySelector('#results-table tbody');
const startTestButton = document.getElementById('start-test');

// Inicializar Chart.js
let resultsChart = null;

// Evento de submissão do formulário
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Desabilitar o botão durante o teste
  startTestButton.disabled = true;
  startTestButton.textContent = 'Testando...';
  
  // Mostrar o contêiner de progresso
  progressContainer.classList.remove('d-none');
  resultContainer.classList.add('d-none');
  
  // Resetar a barra de progresso
  progressBar.style.width = '0%';
  progressBar.setAttribute('aria-valuenow', 0);
  progressInfo.textContent = 'Iniciando teste...';
  
  // Obter o formulário e adicionar o socketId
  const formData = new FormData(uploadForm);
  formData.append('socketId', socketId);
  
  try {
    // Fazer upload dos arquivos e iniciar o teste
    const response = await fetch('/upload', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Erro ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    displayTestResult(result);
    
    // Recarregar os resultados anteriores
    loadPreviousResults();
    
    // Habilitar o botão novamente
    startTestButton.disabled = false;
    startTestButton.textContent = 'Iniciar Teste';
  } catch (error) {
    console.error('Erro:', error);
    alert(`Ocorreu um erro: ${error.message}`);
    
    // Habilitar o botão novamente
    startTestButton.disabled = false;
    startTestButton.textContent = 'Iniciar Teste';
  }
});

// Ouvir atualizações de progresso via Socket.IO
socket.on('progress', (data) => {
  const { progress, remainingTime } = data;
  
  // Atualizar a barra de progresso
  progressBar.style.width = `${progress}%`;
  progressBar.setAttribute('aria-valuenow', progress);
  progressInfo.textContent = `Progresso: ${progress}%`;
  timeRemaining.textContent = `Tempo restante: ${remainingTime} segundos`;
});

// Exibir o resultado do teste
function displayTestResult(result) {
  // Mostrar o contêiner de resultado
  resultContainer.classList.remove('d-none');
  
  if (result.success && result.password) {
    // Senha encontrada
    resultSuccess.classList.remove('d-none');
    resultFailure.classList.add('d-none');
    passwordFound.textContent = result.password;
  } else {
    // Senha não encontrada
    resultSuccess.classList.add('d-none');
    resultFailure.classList.remove('d-none');
  }
  
  // Atualizar as informações do resultado
  executionTime.textContent = (result.executionTime / 1000).toFixed(2);
  testedWords.textContent = result.testedWords ? result.testedWords.toLocaleString() : '0';
  totalWords.textContent = result.totalWords ? result.totalWords.toLocaleString() : '0';
}

// Carregar resultados anteriores
async function loadPreviousResults() {
  try {
    const response = await fetch('/results');
    if (!response.ok) {
      throw new Error(`Erro ${response.status}: ${response.statusText}`);
    }
    
    const csvData = await response.text();
    if (!csvData.trim()) {
      console.log('Nenhum resultado anterior encontrado');
      return;
    }
    
    // Processar o CSV
    const results = parseCSV(csvData);
    displayResults(results);
  } catch (error) {
    console.error('Erro ao carregar resultados anteriores:', error);
  }
}

// Analisar o CSV
function parseCSV(csvData) {
  const lines = csvData.split('\n');
  const headers = lines[0].split(',');
  
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].split(',');
    const result = {};
    
    for (let j = 0; j < headers.length; j++) {
      result[headers[j]] = values[j];
    }
    
    results.push(result);
  }
  
  return results;
}

// Exibir os resultados na tabela e no gráfico
function displayResults(results) {
  // Limpar a tabela
  resultsTable.innerHTML = '';
  
  // Preencher a tabela
  results.forEach(result => {
    const row = document.createElement('tr');
    
    row.innerHTML = `
      <td>${result['Arquivo ZIP'] || '-'}</td>
      <td>${result['Word List'] || '-'}</td>
      <td>${result['Linguagem'] || '-'}</td>
      <td>${result['Tempo de Execução (ms)'] || '-'}</td>
      <td>${result['Resultado'] || '-'}</td>
      <td>${result['Data/Hora'] || '-'}</td>
    `;
    
    resultsTable.appendChild(row);
  });
  
  // Criar dados para o gráfico
  createResultsChart(results);
}

// Criar um gráfico comparativo
function createResultsChart(results) {
  // Destruir o gráfico anterior se existir
  if (resultsChart) {
    resultsChart.destroy();
  }
  
  // Preparar dados para o gráfico
  const languageLabels = [...new Set(results.map(r => r['Linguagem']))];
  const datasets = [];
  
  // Agrupar por arquivo ZIP e word list
  const uniqueFiles = [...new Set(results.map(r => `${r['Arquivo ZIP']} / ${r['Word List']}`))];
  
  uniqueFiles.forEach((fileCombo, index) => {
    const fileData = results.filter(r => `${r['Arquivo ZIP']} / ${r['Word List']}` === fileCombo);
    
    const dataset = {
      label: fileCombo,
      data: languageLabels.map(lang => {
        const match = fileData.find(r => r['Linguagem'] === lang);
        return match ? parseInt(match['Tempo de Execução (ms)']) / 1000 : 0;
      }),
      backgroundColor: getRandomColor(index),
      borderColor: getRandomColor(index),
      borderWidth: 1
    };
    
    datasets.push(dataset);
  });
  
  // Criar o gráfico
  const ctx = document.getElementById('resultsChart').getContext('2d');
  resultsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: languageLabels,
      datasets: datasets
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Tempo de execução (segundos)'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Linguagem'
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: 'Comparativo de Desempenho por Linguagem'
        },
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

// Gerar uma cor aleatória
function getRandomColor(index) {
  const predefinedColors = [
    'rgba(75, 192, 192, 0.7)',
    'rgba(255, 99, 132, 0.7)',
    'rgba(54, 162, 235, 0.7)',
    'rgba(255, 206, 86, 0.7)',
    'rgba(153, 102, 255, 0.7)',
    'rgba(255, 159, 64, 0.7)'
  ];
  
  return predefinedColors[index % predefinedColors.length];
}

// Carregar resultados anteriores ao iniciar
document.addEventListener('DOMContentLoaded', () => {
  loadPreviousResults();
}); 