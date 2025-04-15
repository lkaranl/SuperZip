const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

/**
 * Função para chamar o módulo Python para quebrar a senha do ZIP
 * @param {string} zipFilePath - Caminho para o arquivo ZIP
 * @param {string} wordListPath - Caminho para o arquivo de lista de palavras
 * @param {Function} progressCallback - Callback para atualização de progresso
 * @returns {Promise<Object>} - Resultado do teste com tempo de execução e senha (se encontrada)
 */
function crackZip(zipFilePath, wordListPath, progressCallback = null) {
  return new Promise((resolve, reject) => {
    // Verificar se o script Python existe
    const scriptPath = path.join(__dirname, 'zip_cracker.py');
    
    if (!fs.existsSync(scriptPath)) {
      return reject({
        success: false,
        error: `Erro: Script Python não encontrado em ${scriptPath}`,
        executionTime: 0,
        testedWords: 0,
        totalWords: 0
      });
    }
    
    // Verificar se o Python está instalado
    try {
      // Tornar o script executável
      fs.chmodSync(scriptPath, '755');
    } catch (error) {
      console.error(`Aviso: Não foi possível tornar o script executável: ${error.message}`);
    }
    
    // Executar o script Python
    const process = spawn('python3', [scriptPath, zipFilePath, wordListPath]);
    
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
          
          // Sempre atualizar
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
          error: `Erro ao executar o módulo Python: código de saída ${code}`,
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
          error: `Erro ao processar resultado do módulo Python: ${parseError.message}`,
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
        error: `Erro ao executar o módulo Python: ${error.message}`,
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