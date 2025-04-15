const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { execSync } = require('child_process');
const { spawn } = require('child_process');

/**
 * Tenta quebrar a senha de um arquivo ZIP usando ataque de dicionário
 * @param {string} zipFilePath - Caminho para o arquivo ZIP
 * @param {string} wordListPath - Caminho para o arquivo de lista de palavras
 * @param {Function} progressCallback - Callback para atualização de progresso
 * @returns {Promise<Object>} - Resultado do teste com tempo de execução e senha (se encontrada)
 */
async function crackZip(zipFilePath, wordListPath, progressCallback = null) {
  const startTime = Date.now();
  let passwordFound = null;
  let totalWords = 0;
  let testedWords = 0;
  let lastUpdateTime = startTime;
  
  try {
    // Verificar se o comando unzip está disponível
    try {
      execSync('which unzip', { stdio: 'ignore' });
    } catch (error) {
      console.log('O comando unzip não está disponível, tentando usar 7z...');
      try {
        execSync('which 7z', { stdio: 'ignore' });
      } catch (err) {
        throw new Error('Nenhuma ferramenta de descompactação (unzip ou 7z) está disponível no sistema.');
      }
    }
    
    // Contar o número total de palavras no dicionário para cálculo de progresso
    totalWords = await countLines(wordListPath);
    
    // Criar stream de leitura para a word list
    const fileStream = fs.createReadStream(wordListPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    // Para cada palavra no dicionário
    for await (const line of rl) {
      testedWords++;
      const password = line.trim();
      
      // Ignorar linhas vazias
      if (!password) continue;
      
      // Atualizar o progresso a cada segundo ou 1000 palavras
      const currentTime = Date.now();
      if (currentTime - lastUpdateTime > 1000 || testedWords % 1000 === 0) {
        const progress = (testedWords / totalWords) * 100;
        const elapsedTime = currentTime - startTime;
        const estimatedTotalTime = (elapsedTime / progress) * 100;
        const remainingTime = estimatedTotalTime - elapsedTime;
        
        // Enviar progresso para callback se existir
        if (typeof progressCallback === 'function') {
          progressCallback(progress.toFixed(2), (remainingTime / 1000).toFixed(0));
        }
        
        // Também registrar no console
        console.log(`Progresso: ${progress.toFixed(2)}%, Tempo restante: ${(remainingTime / 1000).toFixed(0)}s, Tentando senha: ${password}`);
        lastUpdateTime = currentTime;
      }
      
      // Primeiro tenta com 7z se disponível
      try {
        const result = await test7zPassword(zipFilePath, password);
        if (result) {
          passwordFound = password;
          console.log(`Senha encontrada com 7z: ${password}`);
          break;
        }
      } catch (e) {
        // Ignora erro, tenta com unzip
      }
      
      // Depois tenta com unzip
      try {
        if (testUnzipPassword(zipFilePath, password)) {
          passwordFound = password;
          console.log(`Senha encontrada com unzip: ${password}`);
          break;
        }
      } catch (e) {
        // Ignora erro e continua
      }
    }
    
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    // Enviar progresso final para callback se existir
    if (typeof progressCallback === 'function') {
      progressCallback(100, 0);
    }
    
    return {
      success: !!passwordFound,
      password: passwordFound,
      executionTime,
      testedWords,
      totalWords
    };
  } catch (error) {
    console.error('Erro ao quebrar senha ZIP:', error);
    return {
      success: false,
      error: error.message,
      executionTime: Date.now() - startTime,
      testedWords,
      totalWords
    };
  }
}

/**
 * Testa se uma senha funciona para um arquivo ZIP usando 7z
 * @param {string} zipFilePath - Caminho para o arquivo ZIP
 * @param {string} password - Senha a ser testada
 * @returns {Promise<boolean>} - true se a senha funcionar, false caso contrário
 */
async function test7zPassword(zipFilePath, password) {
  return new Promise((resolve, reject) => {
    try {
      const process = spawn('7z', ['t', '-p' + password, zipFilePath]);
      
      let stdoutData = '';
      let stderrData = '';
      
      process.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderrData += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          // Sucesso - senha correta
          resolve(true);
        } else {
          // Erro - senha incorreta
          resolve(false);
        }
      });
      
      process.on('error', (err) => {
        reject(err);
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Testa se uma senha funciona para um arquivo ZIP usando unzip
 * @param {string} zipFilePath - Caminho para o arquivo ZIP
 * @param {string} password - Senha a ser testada
 * @returns {boolean} - true se a senha funcionar, false caso contrário
 */
function testUnzipPassword(zipFilePath, password) {
  try {
    // Escapa qualquer caracter especial
    const escapedPassword = password.replace(/"/g, '\\"');
    
    // -t apenas testa sem extrair
    const command = `unzip -P "${escapedPassword}" -t "${zipFilePath}" > /dev/null 2>&1`;
    
    execSync(command);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Conta o número de linhas em um arquivo
 * @param {string} filePath - Caminho para o arquivo
 * @returns {Promise<number>} - Número de linhas
 */
async function countLines(filePath) {
  return new Promise((resolve, reject) => {
    let lineCount = 0;
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    rl.on('line', () => lineCount++);
    rl.on('close', () => resolve(lineCount));
    rl.on('error', reject);
  });
}

module.exports = {
  crackZip
}; 