const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { spawn } = require('child_process');

/**
 * Função para chamar o módulo C++ para quebrar a senha do ZIP
 * @param {string} zipFilePath - Caminho para o arquivo ZIP
 * @param {string} wordListPath - Caminho para o arquivo de lista de palavras
 * @param {Function} progressCallback - Callback para atualização de progresso
 * @returns {Promise<Object>} - Resultado do teste com tempo de execução e senha (se encontrada)
 */
function crackZip(zipFilePath, wordListPath, progressCallback = null) {
  return new Promise((resolve, reject) => {
    // Verificar se o binário existe
    const binaryPath = path.join(__dirname, 'zipCracker');
    
    if (!fs.existsSync(binaryPath)) {
      // Tentar compilar o binário se não existir
      try {
        const makeCommand = `cd ${__dirname} && make`;
        exec(makeCommand, (error) => {
          if (error) {
            return reject({
              success: false,
              error: `Erro ao compilar o módulo C++: ${error.message}`,
              executionTime: 0,
              testedWords: 0,
              totalWords: 0
            });
          }
          
          // Chamar a função novamente após compilar
          crackZip(zipFilePath, wordListPath, progressCallback)
            .then(resolve)
            .catch(reject);
        });
        return;
      } catch (error) {
        return reject({
          success: false,
          error: `Erro ao compilar o módulo C++: ${error.message}`,
          executionTime: 0,
          testedWords: 0,
          totalWords: 0
        });
      }
    }
    
    // Executar o binário C++ usando spawn para capturar a saída em tempo real
    const process = spawn(binaryPath, [zipFilePath, wordListPath]);
    
    let resultData = '';
    let lastProgress = 0;
    
    // Configurar readline para processar a saída de erro linha por linha
    const rl = readline.createInterface({
      input: process.stderr,
      crlfDelay: Infinity
    });
    
    // Processar cada linha de saída
    rl.on('line', (line) => {
      // Verificar se é uma linha de progresso
      if (line.includes('Progresso:') && typeof progressCallback === 'function') {
        // Extrair informações de progresso
        const progressMatch = line.match(/Progresso: ([\d.]+)%/);
        const timeMatch = line.match(/Tempo restante: ([\d.]+)s/);
        const wordMatch = line.match(/Tentando: (.+)$/);
        
        if (progressMatch && timeMatch && wordMatch) {
          const progress = parseFloat(progressMatch[1]);
          const remainingTime = parseFloat(timeMatch[1]);
          const currentWord = wordMatch[1].trim();
          
          // Sempre atualizar, sem filtro de diferença mínima
          progressCallback(progress.toFixed(2), remainingTime.toFixed(0), currentWord);
          lastProgress = progress;
        }
      }
    });
    
    // Capturar saída padrão (onde o JSON final é escrito)
    process.stdout.on('data', (data) => {
      resultData += data.toString();
    });
    
    // Quando o processo terminar
    process.on('close', (code) => {
      if (code !== 0) {
        return reject({
          success: false,
          error: `Erro ao executar o módulo C++: código de saída ${code}`,
          executionTime: 0,
          testedWords: 0,
          totalWords: 0
        });
      }
      
      try {
        // Tentar analisar a saída como JSON
        const result = JSON.parse(resultData);
        
        // Enviar progresso final
        if (typeof progressCallback === 'function') {
          progressCallback(100, 0, null);
        }
        
        resolve(result);
      } catch (parseError) {
        reject({
          success: false,
          error: `Erro ao processar resultado do módulo C++: ${parseError.message}`,
          executionTime: 0,
          testedWords: 0,
          totalWords: 0
        });
      }
    });
    
    // Tratar erros de execução
    process.on('error', (error) => {
      reject({
        success: false,
        error: `Erro ao executar o módulo C++: ${error.message}`,
        executionTime: 0,
        testedWords: 0,
        totalWords: 0
      });
    });
  });
}

module.exports = {
  crackZip
}; 