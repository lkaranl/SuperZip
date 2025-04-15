#!/usr/bin/env python3
import sys
import time
import json
import zipfile
import subprocess
import os
import threading
import queue
import multiprocessing
from datetime import datetime

# Global variables
found_password = None
found_lock = threading.Lock()
stop_threads = threading.Event()
tested_words_counter = 0
counter_lock = threading.Lock()
active_threads = 0
threads_lock = threading.Lock()

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
        print(f"ERRO ao contar linhas: {str(e)}", file=sys.stderr)
        return 0

def password_test_worker(zip_path, password_queue, progress_callback=None):
    """
    Worker thread para testar senhas
    
    Args:
        zip_path (str): Caminho para o arquivo ZIP
        password_queue (Queue): Fila de senhas para testar
        progress_callback (callable): Função de callback para atualizar o progresso
    """
    global found_password, tested_words_counter, active_threads
    
    # Incrementar contador de threads ativas
    with threads_lock:
        active_threads += 1
        current_active = active_threads
    
    print(f"INFO: Thread iniciada. Total de threads ativas: {current_active}", file=sys.stderr)
    
    try:
        while not stop_threads.is_set():
            try:
                # Pegar próxima senha da fila (timeout para verificar o sinal de parada)
                password = password_queue.get(timeout=0.1)
                
                # Incrementar contador de palavras testadas
                with counter_lock:
                    tested_words_counter += 1
                
                # Se já encontrou a senha, não precisa testar mais
                if found_password is not None:
                    password_queue.task_done()
                    continue
                
                # Testar senha
                if test_zip_password(zip_path, password):
                    # Encontrou a senha, marcar e parar as threads
                    with found_lock:
                        if found_password is None:  # Evitar sobrescrever se outra thread já encontrou
                            found_password = password
                            print(f"SUCESSO: Thread encontrou a senha: '{password}'", file=sys.stderr)
                            stop_threads.set()
                
                password_queue.task_done()
                
            except queue.Empty:
                # Fila vazia, verificar se é para parar
                if stop_threads.is_set():
                    break
    finally:
        # Decrementar contador de threads ativas
        with threads_lock:
            active_threads -= 1
            current_active = active_threads
        
        print(f"INFO: Thread finalizada. Total de threads ativas: {current_active}", file=sys.stderr)

def crack_zip(zip_path, wordlist_path):
    """
    Tenta quebrar a senha de um arquivo ZIP usando ataque de dicionário com múltiplas threads
    
    Args:
        zip_path (str): Caminho para o arquivo ZIP
        wordlist_path (str): Caminho para o arquivo de lista de palavras
        
    Returns:
        dict: Resultado do teste com tempo de execução e senha (se encontrada)
    """
    global found_password, tested_words_counter, active_threads
    
    # Resetar variáveis globais
    found_password = None
    stop_threads.clear()
    tested_words_counter = 0
    active_threads = 0
    
    start_time = time.time()
    
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
            "totalWords": 0,
            "threadsUsed": 0
        }
    
    # Contar o número total de palavras
    print(f"INFO: Contando linhas em {wordlist_path}...", file=sys.stderr)
    total_words = count_lines(wordlist_path)
    print(f"INFO: Total de {total_words} palavras na lista", file=sys.stderr)
    
    # Determinar número de threads - limitando para evitar sobrecarga
    num_cores = multiprocessing.cpu_count()
    # Limitar a um número razoável de threads para evitar travamentos (2 por core é geralmente o ideal)
    num_threads = max(2, min(num_cores * 2, 16))  # Mínimo 2, máximo 16 threads
    print(f"INFO: Usando {num_threads} threads para processamento paralelo", file=sys.stderr)
    
    # Criar fila de senhas com tamanho limitado para evitar consumo excessivo de memória
    password_queue = queue.Queue(maxsize=5000)
    
    # Iniciar threads worker
    workers = []
    for i in range(num_threads):
        worker = threading.Thread(
            target=password_test_worker,
            args=(zip_path, password_queue),
            daemon=True
        )
        worker.start()
        workers.append(worker)
    
    # Variáveis para controle de progresso
    last_update_time = start_time
    batch_size = 100  # Processar palavras em lotes para melhor performance
    heartbeat_time = time.time()  # Para detecção de travamentos
    
    try:
        # Lista de codificações para tentar
        encodings = ['utf-8', 'latin1', 'cp1252', 'ascii']
        
        for encoding_idx, encoding in enumerate(encodings):
            if found_password is not None or stop_threads.is_set():
                break
                
            try:
                # Abrir a lista de palavras com a codificação atual
                print(f"INFO: Lendo lista com codificação {encoding}...", file=sys.stderr)
                
                # Processar o arquivo em lotes para evitar sobrecarregar a memória
                with open(wordlist_path, 'r', encoding=encoding, errors='ignore') as wordlist:
                    current_batch = []
                    
                    for line in wordlist:
                        if found_password is not None or stop_threads.is_set():
                            break
                            
                        password = line.strip()
                        
                        # Ignorar linhas vazias
                        if not password:
                            continue
                        
                        current_batch.append(password)
                        
                        # Processar o lote quando atingir o tamanho definido
                        if len(current_batch) >= batch_size:
                            # Adicionar lote à fila
                            for pwd in current_batch:
                                # Verificar se a fila está quase cheia (90%) e aguardar se estiver
                                while password_queue.qsize() > password_queue.maxsize * 0.9:
                                    time.sleep(0.01)  # Pequena pausa para dar tempo às threads de consumir a fila
                                    
                                    # Verificar heartbeat a cada 5 segundos
                                    current_time = time.time()
                                    if current_time - heartbeat_time > 5:
                                        heartbeat_time = current_time
                                        print(f"HEARTBEAT: Fila com {password_queue.qsize()} senhas, {active_threads} threads ativas", 
                                              file=sys.stderr, flush=True)
                                    
                                    # Sair se a senha foi encontrada ou se as threads foram paradas
                                    if found_password is not None or stop_threads.is_set():
                                        break
                                
                                # Adicionar senha à fila se não encontrou ainda
                                if found_password is None and not stop_threads.is_set():
                                    password_queue.put(pwd)
                            
                            # Limpar lote
                            current_batch = []
                        
                        # Atualizar o progresso a cada 100ms
                        current_time = time.time()
                        elapsed_time = current_time - last_update_time
                        
                        if elapsed_time > 0.1:
                            progress = (tested_words_counter / total_words) * 100 if total_words > 0 else 0
                            total_elapsed_time = current_time - start_time
                            
                            # Evitar divisão por zero
                            if progress > 0:
                                estimated_total_time = (total_elapsed_time / progress) * 100
                                remaining_time = estimated_total_time - total_elapsed_time
                            else:
                                remaining_time = 0
                            
                            # Enviar progresso para stderr
                            print(f"Progresso: {progress:.2f}%, Tempo restante: {remaining_time:.2f}s, Testadas: {tested_words_counter}, Threads: {active_threads}, Tentando: {password}", 
                                  file=sys.stderr, flush=True)
                            last_update_time = current_time
                    
                    # Processar o lote restante, se houver
                    if current_batch and found_password is None and not stop_threads.is_set():
                        for pwd in current_batch:
                            # Verificar se a fila está quase cheia (90%) e aguardar se estiver
                            while password_queue.qsize() > password_queue.maxsize * 0.9:
                                time.sleep(0.01)
                                if found_password is not None or stop_threads.is_set():
                                    break
                                    
                            # Adicionar senha à fila se não encontrou ainda
                            if found_password is None and not stop_threads.is_set():
                                password_queue.put(pwd)
                
                # Esperar todas as senhas serem processadas se não encontrou ainda
                if found_password is None and not stop_threads.is_set() and encoding_idx == len(encodings) - 1:
                    print(f"INFO: Aguardando threads finalizarem o processamento...", file=sys.stderr)
                    
                    # Aguardar a fila estar vazia ou uma senha ser encontrada
                    while not password_queue.empty() and found_password is None and not stop_threads.is_set():
                        time.sleep(0.1)
                        
                        # Verificar se houve progresso
                        current_time = time.time()
                        if current_time - heartbeat_time > 5:
                            heartbeat_time = current_time
                            print(f"HEARTBEAT: Fila com {password_queue.qsize()} senhas, {active_threads} threads ativas, {tested_words_counter} testadas", 
                                  file=sys.stderr, flush=True)
                    
            except UnicodeDecodeError:
                print(f"AVISO: Erro de decodificação com {encoding}, tentando próxima codificação", file=sys.stderr)
                continue
            except Exception as e:
                print(f"ERRO ao processar lista de palavras com {encoding}: {str(e)}", file=sys.stderr)
                if encoding == encodings[-1] and found_password is None:
                    stop_threads.set()
                    return {
                        "success": False,
                        "error": str(e),
                        "executionTime": int((time.time() - start_time) * 1000),
                        "testedWords": tested_words_counter,
                        "totalWords": total_words,
                        "threadsUsed": num_threads
                    }
    finally:
        # Garantir que as threads sejam paradas
        stop_threads.set()
        
        # Esvaziar a fila para liberar threads bloqueadas
        while not password_queue.empty():
            try:
                password_queue.get_nowait()
                password_queue.task_done()
            except:
                pass
    
    # Aguardar todas as threads finalizarem com timeout
    for worker in workers:
        worker.join(timeout=1.0)
    
    end_time = time.time()
    execution_time = int((end_time - start_time) * 1000)
    
    # Enviar progresso final
    print(f"Progresso: 100%, Tempo restante: 0s, Testadas: {tested_words_counter}, Threads: {active_threads}, Senha: {found_password or 'Não encontrada'}", 
          file=sys.stderr, flush=True)
    
    # Retornar o resultado
    if found_password:
        result = {
            "success": True,
            "password": found_password,
            "executionTime": execution_time,
            "testedWords": tested_words_counter,
            "totalWords": total_words,
            "threadsUsed": num_threads
        }
    else:
        result = {
            "success": False,
            "password": None,
            "executionTime": execution_time,
            "testedWords": tested_words_counter,
            "totalWords": total_words,
            "threadsUsed": num_threads
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