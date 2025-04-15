#!/usr/bin/env python3
import sys
import time
import json
import zipfile
import subprocess
import os
from datetime import datetime

def test_7z_password(zip_path, password):
    """
    Testa se uma senha funciona para um arquivo ZIP usando 7z
    
    Args:
        zip_path (str): Caminho para o arquivo ZIP
        password (str): Senha a ser testada
        
    Returns:
        bool: True se a senha funcionar, False caso contrário
    """
    try:
        # Comando 7z para testar senha
        command = ['7z', 't', '-p' + password, zip_path]
        
        # Executar o comando e suprimindo saída
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        # Verificar o código de retorno (0 = sucesso)
        return result.returncode == 0
    except Exception as e:
        print(f"ERRO ao testar senha com 7z: {str(e)}", file=sys.stderr)
        return False

def test_unzip_password(zip_path, password):
    """
    Testa se uma senha funciona para um arquivo ZIP usando unzip
    
    Args:
        zip_path (str): Caminho para o arquivo ZIP
        password (str): Senha a ser testada
        
    Returns:
        bool: True se a senha funcionar, False caso contrário
    """
    try:
        # Escapa a senha para uso em shell
        escaped_password = password.replace('"', '\\"')
        
        # Comando unzip para testar senha (-t apenas testa)
        command = f'unzip -P "{escaped_password}" -t "{zip_path}" > /dev/null 2>&1'
        
        # Executar o comando
        return subprocess.call(command, shell=True) == 0
    except Exception as e:
        print(f"ERRO ao testar senha com unzip: {str(e)}", file=sys.stderr)
        return False

def test_zip_password(zip_path, password):
    """
    Testa se uma senha funciona para um arquivo ZIP
    Tenta primeiro com 7z, depois com unzip, e finalmente com zipfile nativo
    
    Args:
        zip_path (str): Caminho para o arquivo ZIP
        password (str): Senha a ser testada
        
    Returns:
        bool: True se a senha funcionar, False caso contrário
    """
    # Primeiro tenta com 7z (se disponível)
    try:
        # Verificar se 7z está disponível
        subprocess.run(['which', '7z'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        
        # Testar com 7z
        if test_7z_password(zip_path, password):
            print(f"INFO: Senha correta encontrada com 7z: '{password}'", file=sys.stderr)
            return True
    except:
        print("AVISO: 7z não está disponível, tentando unzip", file=sys.stderr)
    
    # Depois tenta com unzip (se disponível)
    try:
        # Verificar se unzip está disponível
        subprocess.run(['which', 'unzip'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        
        # Testar com unzip
        if test_unzip_password(zip_path, password):
            print(f"INFO: Senha correta encontrada com unzip: '{password}'", file=sys.stderr)
            return True
    except:
        print("AVISO: unzip não está disponível, tentando módulo zipfile", file=sys.stderr)
    
    # Por último, tenta com o módulo zipfile nativo
    try:
        # Converte a senha para bytes se for string
        if isinstance(password, str):
            # Tenta diferentes codificações, já que não sabemos como o arquivo foi criado
            encodings = ['utf-8', 'latin1', 'cp1252', 'ascii']
            pwd_bytes = None
            
            # Primeiro tenta a codificação padrão
            try:
                pwd_bytes = password.encode('utf-8')
            except UnicodeEncodeError:
                # Se falhar, tenta outras codificações
                for encoding in encodings:
                    try:
                        pwd_bytes = password.encode(encoding)
                        break  # Para no primeiro que funcionar
                    except UnicodeEncodeError:
                        continue
                
                # Se nenhuma codificação funcionar
                if pwd_bytes is None:
                    print(f"ERRO: Não foi possível codificar a senha '{password}'", file=sys.stderr)
                    return False
        else:
            pwd_bytes = password
            
        # Tenta abrir o arquivo ZIP com a senha
        with zipfile.ZipFile(zip_path) as zf:
            # Verificar se o arquivo está protegido por senha
            encrypted_files = [f for f in zf.infolist() if f.flag_bits & 0x1]
            if not encrypted_files:
                # Se não houver arquivos protegidos, considera a senha como correta
                print(f"INFO: Arquivo ZIP não está protegido por senha", file=sys.stderr)
                return True
                
            # Tenta extrair o primeiro arquivo criptografado
            for zip_info in encrypted_files:
                try:
                    zf.read(zip_info.filename, pwd=pwd_bytes)
                    # Se chegou aqui, a senha está correta
                    print(f"INFO: Senha correta encontrada com zipfile: '{password}'", file=sys.stderr)
                    return True
                except RuntimeError as e:
                    # Senha incorreta
                    if "Bad password" in str(e) or "incorrect password" in str(e).lower():
                        return False
                    # Outro erro de runtime
                    raise
                    
            return False
                
    except zipfile.BadZipFile:
        print(f"ERRO: Arquivo ZIP inválido", file=sys.stderr)
    except Exception as e:
        print(f"ERRO ao testar senha com zipfile: {str(e)}", file=sys.stderr)
        
    return False

def count_lines(file_path):
    """
    Conta o número de linhas em um arquivo
    
    Args:
        file_path (str): Caminho para o arquivo
        
    Returns:
        int: Número de linhas
    """
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return sum(1 for _ in f)
    except Exception as e:
        print(f"Erro ao contar linhas: {e}", file=sys.stderr)
        return 0

def crack_zip(zip_path, wordlist_path):
    """
    Tenta quebrar a senha de um arquivo ZIP usando ataque de dicionário
    
    Args:
        zip_path (str): Caminho para o arquivo ZIP
        wordlist_path (str): Caminho para o arquivo de lista de palavras
        
    Returns:
        dict: Resultado do teste com tempo de execução e senha (se encontrada)
    """
    start_time = time.time()
    password_found = None
    found = False
    
    print(f"INFO: Iniciando quebra de senha para {zip_path} usando lista {wordlist_path}", file=sys.stderr)
    print(f"INFO: Verificando arquivo ZIP...", file=sys.stderr)
    
    # Verificar se o arquivo ZIP está protegido por senha
    try:
        with zipfile.ZipFile(zip_path) as zf:
            encrypted_files = [f for f in zf.infolist() if f.flag_bits & 0x1]
            if not encrypted_files:
                print(f"ALERTA: Arquivo ZIP não possui arquivos protegidos por senha!", file=sys.stderr)
    except Exception as e:
        print(f"ERRO ao verificar arquivo ZIP: {str(e)}", file=sys.stderr)
        return {
            "success": False,
            "error": f"Erro ao verificar arquivo ZIP: {str(e)}",
            "executionTime": int((time.time() - start_time) * 1000),
            "testedWords": 0,
            "totalWords": 0
        }
    
    # Contar o número total de palavras
    print(f"INFO: Contando linhas em {wordlist_path}...", file=sys.stderr)
    total_words = count_lines(wordlist_path)
    print(f"INFO: Total de {total_words} palavras na lista", file=sys.stderr)
    
    tested_words = 0
    last_update_time = start_time
    
    # Lista de codificações para tentar
    encodings = ['utf-8', 'latin1', 'cp1252', 'ascii']
    
    for encoding in encodings:
        if found:
            break
            
        try:
            # Abrir a lista de palavras com a codificação atual
            print(f"INFO: Testando com codificação {encoding}...", file=sys.stderr)
            with open(wordlist_path, 'r', encoding=encoding, errors='ignore') as wordlist:
                # Para cada palavra na lista
                for line in wordlist:
                    tested_words += 1
                    password = line.strip()
                    
                    # Ignorar linhas vazias
                    if not password:
                        continue
                    
                    # Atualizar o progresso a cada 100ms ou 100 palavras
                    current_time = time.time()
                    elapsed_time = current_time - last_update_time
                    
                    if elapsed_time > 0.1 or tested_words % 100 == 0:
                        progress = (tested_words / total_words) * 100
                        total_elapsed_time = current_time - start_time
                        
                        # Evitar divisão por zero
                        if progress > 0:
                            estimated_total_time = (total_elapsed_time / progress) * 100
                            remaining_time = estimated_total_time - total_elapsed_time
                        else:
                            remaining_time = 0
                        
                        print(f"Progresso: {progress:.2f}%, Tempo restante: {remaining_time:.2f}s, Tentando: {password}", 
                              file=sys.stderr, flush=True)
                        last_update_time = current_time
                    
                    # Testar a senha atual
                    if test_zip_password(zip_path, password):
                        password_found = password
                        found = True
                        print(f"SUCESSO: Senha encontrada: '{password}' com codificação {encoding}", file=sys.stderr)
                        break
            
            if not found and encoding == encodings[-1]:
                print(f"INFO: Senha não encontrada após testar {tested_words} palavras com todas as codificações", file=sys.stderr)
                
        except UnicodeDecodeError:
            print(f"AVISO: Erro de decodificação com {encoding}, tentando próxima codificação", file=sys.stderr)
            continue
        except Exception as e:
            print(f"ERRO ao processar lista de palavras com {encoding}: {str(e)}", file=sys.stderr)
            if encoding == encodings[-1]:  # Se for a última codificação
                return {
                    "success": False,
                    "error": str(e),
                    "executionTime": int((time.time() - start_time) * 1000),
                    "testedWords": tested_words,
                    "totalWords": total_words
                }
    
    end_time = time.time()
    execution_time = int((end_time - start_time) * 1000)
    
    # Enviar progresso final
    print(f"Progresso: 100%, Tempo restante: 0s, Tentando: {password}", file=sys.stderr, flush=True)
    
    # Retornar o resultado
    if found:
        result = {
            "success": True,
            "password": password_found,
            "executionTime": execution_time,
            "testedWords": tested_words,
            "totalWords": total_words
        }
    else:
        result = {
            "success": False,
            "password": None,
            "executionTime": execution_time,
            "testedWords": tested_words,
            "totalWords": total_words
        }
    
    return result

def main():
    """Função principal"""
    if len(sys.argv) != 3:
        print(f"Uso: {sys.argv[0]} <arquivo_zip> <lista_palavras>", file=sys.stderr)
        sys.exit(1)
    
    zip_path = sys.argv[1]
    wordlist_path = sys.argv[2]
    
    result = crack_zip(zip_path, wordlist_path)
    
    # Imprimir o resultado como JSON
    print(json.dumps(result))

if __name__ == "__main__":
    main() 