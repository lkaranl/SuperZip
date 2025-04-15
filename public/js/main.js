// Conectar ao servidor via Socket.IO
const socket = io();
let socketId = null;
let testRunning = false;

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
const currentWord = document.getElementById('current-word');

// Inicializar Chart.js
let resultsChart = null;

// Evento de submissão do formulário
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Evitar submissões múltiplas
  if (testRunning) return;
  
  testRunning = true;
  
  // Desabilitar o botão durante o teste
  startTestButton.disabled = true;
  startTestButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Testando...';
  
  // Mostrar o contêiner de progresso
  progressContainer.classList.remove('d-none');
  resultContainer.classList.add('d-none');
  
  // Resetar a barra de progresso
  resetProgressBar();
  
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
    
    // Completar a barra de progresso
    completeProgressBar();
    
    // Exibir o resultado
    displayTestResult(result);
    
    // Recarregar os resultados anteriores
    loadPreviousResults();
    
    // Habilitar o botão novamente
    startTestButton.disabled = false;
    startTestButton.innerHTML = '<i class="fas fa-play me-2"></i>Iniciar Teste';
    
    // Esconder o container de progresso após 1.5 segundos
    setTimeout(() => {
      if (!progressContainer.classList.contains('d-none')) {
        progressContainer.classList.add('d-none');
      }
    }, 1500);
    
  } catch (error) {
    console.error('Erro:', error);
    alert(`Ocorreu um erro: ${error.message}`);
    
    // Resetar a barra de progresso em caso de erro
    resetProgressBar();
    progressContainer.classList.add('d-none');
    
    // Habilitar o botão novamente
    startTestButton.disabled = false;
    startTestButton.innerHTML = '<i class="fas fa-play me-2"></i>Iniciar Teste';
  } finally {
    testRunning = false;
  }
});

// Função para resetar a barra de progresso
function resetProgressBar() {
  progressBar.style.width = '0%';
  progressBar.setAttribute('aria-valuenow', 0);
  progressBar.classList.add('progress-bar-striped', 'progress-bar-animated');
  progressBar.classList.remove('bg-success', 'progress-bar-complete');
  progressInfo.textContent = 'Iniciando teste...';
  timeRemaining.textContent = 'Tempo restante: Calculando...';
  currentWord.innerHTML = '<i class="fas fa-key me-1"></i>Palavra atual: <span class="badge bg-secondary">aguardando</span>';
}

// Função para completar a barra de progresso
function completeProgressBar() {
  progressBar.style.width = '100%';
  progressBar.setAttribute('aria-valuenow', 100);
  progressBar.classList.remove('progress-bar-striped', 'progress-bar-animated');
  progressBar.classList.add('bg-success', 'progress-bar-complete');
  progressInfo.textContent = 'Teste concluído com sucesso!';
  timeRemaining.textContent = 'Tempo restante: 0 segundos';
  currentWord.innerHTML = '<i class="fas fa-key me-1"></i>Palavra atual: <span class="badge bg-success">concluído</span>';
}

// Ouvir atualizações de progresso via Socket.IO
socket.on('progress', (data) => {
  if (!testRunning) return;
  
  const { progress, remainingTime, currentWord: currentTryingWord } = data;
  
  // Verificar se o progresso já está em 100%
  if (parseInt(progressBar.getAttribute('aria-valuenow')) >= 100) return;
  
  // Atualizar a barra de progresso
  progressBar.style.width = `${progress}%`;
  progressBar.setAttribute('aria-valuenow', progress);
  progressInfo.textContent = `Progresso: ${progress}%`;
  timeRemaining.textContent = `Tempo restante: ${remainingTime} segundos`;
  
  // Atualizar a palavra atual
  if (currentTryingWord) {
    currentWord.innerHTML = `<i class="fas fa-key me-1"></i>Palavra atual: <span class="badge bg-primary">${currentTryingWord}</span>`;
  }
  
  // Se o progresso chegar a 100%, finalizar a barra
  if (parseFloat(progress) >= 100) {
    completeProgressBar();
  }
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
  
  // Adicionar informações dos arquivos
  if (result.zipFileOriginal) {
    document.getElementById('zip-file-name').textContent = result.zipFileOriginal;
  }
  if (result.wordListOriginal) {
    document.getElementById('wordlist-name').textContent = result.wordListOriginal;
  }
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
  
  // Preencher a tabela com nomes originais quando disponíveis
  results.forEach(result => {
    const zipFileName = result['Nome Original ZIP'] || result['Arquivo ZIP'] || '-';
    const wordListName = result['Nome Original Word List'] || result['Word List'] || '-';
    
    const row = document.createElement('tr');
    
    row.innerHTML = `
      <td>${zipFileName}</td>
      <td>${wordListName}</td>
      <td>${result['Linguagem'] || '-'}</td>
      <td>${formatTime(result['Tempo de Execução (ms)'] || '0')}</td>
      <td>${result['Resultado'] || '-'}</td>
      <td>${formatDate(result['Data/Hora'] || '-')}</td>
    `;
    
    resultsTable.appendChild(row);
  });
  
  // Criar dados para o gráfico
  createResultsChart(results);
}

// Formatar tempo para exibição
function formatTime(timeMs) {
  const time = parseFloat(timeMs);
  if (isNaN(time)) return '-';
  if (time < 1000) return `${time} ms`;
  return `${(time / 1000).toFixed(2)} s`;
}

// Formatar data para exibição
function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR');
  } catch (e) {
    return dateString;
  }
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
  
  // Agrupar por arquivo ZIP e word list (usar nomes originais quando disponíveis)
  const uniqueFiles = [...new Set(results.map(r => {
    const zipName = r['Nome Original ZIP'] || r['Arquivo ZIP'] || 'Desconhecido';
    const wordlistName = r['Nome Original Word List'] || r['Word List'] || 'Desconhecido';
    return `${zipName} / ${wordlistName}`;
  }))];
  
  uniqueFiles.forEach((fileCombo, index) => {
    const fileData = results.filter(r => {
      const zipName = r['Nome Original ZIP'] || r['Arquivo ZIP'] || 'Desconhecido';
      const wordlistName = r['Nome Original Word List'] || r['Word List'] || 'Desconhecido';
      return `${zipName} / ${wordlistName}` === fileCombo;
    });
    
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
      maintainAspectRatio: false,
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
          text: 'Comparativo de Desempenho por Linguagem',
          font: {
            size: 16,
            weight: 'bold'
          }
        },
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 15,
            padding: 15
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.raw.toFixed(2)} segundos`;
            }
          }
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
    'rgba(255, 159, 64, 0.7)',
    'rgba(29, 209, 161, 0.7)',
    'rgba(238, 90, 36, 0.7)',
    'rgba(106, 137, 204, 0.7)',
    'rgba(196, 69, 105, 0.7)'
  ];
  
  return predefinedColors[index % predefinedColors.length];
}

// Carregar resultados anteriores ao iniciar
document.addEventListener('DOMContentLoaded', () => {
  loadPreviousResults();
}); 