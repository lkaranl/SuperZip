#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <chrono>
#include <zip.h>
#include <cstring>
#include <thread>

/**
 * Testa se uma senha funciona para um arquivo ZIP
 * @param zipPath Caminho para o arquivo ZIP
 * @param password Senha a ser testada
 * @return true se a senha funcionar, false caso contrário
 */
bool testZipPassword(const std::string& zipPath, const std::string& password) {
    int err = 0;
    zip* archive = zip_open(zipPath.c_str(), 0, &err);
    
    if (!archive) {
        std::cerr << "Erro ao abrir arquivo ZIP: " << err << std::endl;
        return false;
    }
    
    // Configura a senha
    if (zip_set_default_password(archive, password.c_str()) != 0) {
        zip_close(archive);
        return false;
    }
    
    // Tenta ler o primeiro arquivo para verificar se a senha está correta
    zip_stat_t stat;
    zip_stat_init(&stat);
    
    bool success = false;
    if (zip_stat_index(archive, 0, 0, &stat) == 0) {
        // Tenta abrir e ler o arquivo
        zip_file_t* file = zip_fopen_index(archive, 0, 0);
        if (file) {
            char buffer[1024];
            if (zip_fread(file, buffer, sizeof(buffer)) >= 0) {
                success = true;
                std::cerr << "Senha encontrada: " << password << std::endl;
            }
            zip_fclose(file);
        }
    }
    
    zip_close(archive);
    return success;
}

/**
 * Conta o número de linhas em um arquivo
 * @param filePath Caminho para o arquivo
 * @return Número de linhas
 */
size_t countLines(const std::string& filePath) {
    std::ifstream file(filePath);
    if (!file) {
        std::cerr << "Erro ao abrir o arquivo: " << filePath << std::endl;
        return 0;
    }
    
    size_t count = 0;
    std::string line;
    while (std::getline(file, line)) {
        count++;
    }
    
    return count;
}

/**
 * Função principal para quebrar a senha de um arquivo ZIP
 * @param zipPath Caminho para o arquivo ZIP
 * @param wordListPath Caminho para a lista de palavras
 */
void crackZip(const std::string& zipPath, const std::string& wordListPath) {
    auto startTime = std::chrono::high_resolution_clock::now();
    
    // Contar o número total de palavras
    size_t totalWords = countLines(wordListPath);
    size_t testedWords = 0;
    std::string passwordFound;
    bool found = false;
    
    // Abrir a lista de palavras
    std::ifstream wordList(wordListPath);
    if (!wordList) {
        std::cerr << "Erro ao abrir a lista de palavras: " << wordListPath << std::endl;
        std::cout << "{\"success\":false,\"error\":\"Erro ao abrir a lista de palavras\",\"executionTime\":0,\"testedWords\":0,\"totalWords\":" << totalWords << "}" << std::endl;
        return;
    }
    
    auto lastUpdateTime = startTime;
    std::string password;
    
    // Para cada palavra na lista
    while (std::getline(wordList, password) && !found) {
        testedWords++;
        
        // Atualizar o progresso a cada 100ms ou 100 palavras
        auto currentTime = std::chrono::high_resolution_clock::now();
        auto elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(currentTime - lastUpdateTime).count();
        
        if (elapsedMs > 100 || testedWords % 100 == 0) {
            double progress = (static_cast<double>(testedWords) / totalWords) * 100.0;
            auto totalElapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(currentTime - startTime).count();
            double estimatedTotalTimeMs = (totalElapsedMs / progress) * 100.0;
            double remainingTimeMs = estimatedTotalTimeMs - totalElapsedMs;
            
            std::cerr << "Progresso: " << progress << "%, Tempo restante: " << (remainingTimeMs / 1000.0) << "s, Tentando: " << password << std::endl;
            std::cerr.flush(); // Forçar a saída imediata
            lastUpdateTime = currentTime;
            
            // Pequena pausa para permitir que o sistema processe a saída
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
        
        // Testar a senha atual
        if (testZipPassword(zipPath, password)) {
            passwordFound = password;
            found = true;
            break;
        }
    }
    
    auto endTime = std::chrono::high_resolution_clock::now();
    auto executionTime = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime).count();
    
    // Enviar progresso final
    std::cerr << "Progresso: 100%, Tempo restante: 0s, Tentando: " << password << std::endl;
    std::cerr.flush();
    
    // Retornar o resultado em formato JSON
    if (found) {
        std::cout << "{\"success\":true,\"password\":\"" << passwordFound << "\",\"executionTime\":" << executionTime << ",\"testedWords\":" << testedWords << ",\"totalWords\":" << totalWords << "}" << std::endl;
    } else {
        std::cout << "{\"success\":false,\"password\":null,\"executionTime\":" << executionTime << ",\"testedWords\":" << testedWords << ",\"totalWords\":" << totalWords << "}" << std::endl;
    }
}

int main(int argc, char* argv[]) {
    if (argc != 3) {
        std::cerr << "Uso: " << argv[0] << " <arquivo_zip> <lista_palavras>" << std::endl;
        return 1;
    }
    
    // Desativar o buffer para stderr para garantir output em tempo real
    std::cerr.setf(std::ios::unitbuf);
    
    crackZip(argv[1], argv[2]);
    return 0;
} 