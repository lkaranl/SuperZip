const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Função para chamar o módulo C++ para quebrar a senha do ZIP
 * @param {string} zipFilePath - Caminho para o arquivo ZIP
 * @param {string} wordListPath - Caminho para o arquivo de lista de palavras
 * @returns {Promise<Object>} - Resultado do teste com tempo de execução e senha (se encontrada)
 */
function crackZip(zipFilePath, wordListPath) {
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
          crackZip(zipFilePath, wordListPath)
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
    
    // Executar o binário C++
    const command = `${binaryPath} "${zipFilePath}" "${wordListPath}"`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        return reject({
          success: false,
          error: `Erro ao executar o módulo C++: ${error.message}`,
          executionTime: 0,
          testedWords: 0,
          totalWords: 0
        });
      }
      
      try {
        // Tentar analisar a saída como JSON
        const result = JSON.parse(stdout);
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
  });
}

module.exports = {
  crackZip
}; 