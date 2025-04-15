# SuperZip

Sistema web para teste comparativo de desempenho na descoberta de senhas em arquivos ZIP.

## Sobre o Projeto

O SuperZip é uma aplicação web desenvolvida para comparar o desempenho de diferentes linguagens de programação (inicialmente Node.js e C++) na tarefa de descobrir senhas de arquivos ZIP protegidos. O sistema utiliza um ataque de dicionário com uma word list fornecida pelo usuário.

## Funcionalidades

- Upload de arquivos ZIP e word lists
- Seleção da linguagem para realizar o teste (Node.js ou C++)
- Visualização do progresso em tempo real
- Exibição de resultados com tempo de execução
- Geração de gráficos comparativos de desempenho
- Persistência de resultados em CSV para análises posteriores

## Tecnologias Utilizadas

### Backend
- Node.js
- Express.js
- Socket.IO para atualizações em tempo real
- C++ (libzip) para implementação do módulo de alta performance

### Frontend
- HTML5, CSS3, JavaScript
- Bootstrap 5 para layout responsivo
- Chart.js para visualização de dados
- Socket.IO client para comunicação em tempo real

## Requisitos

- Node.js 14.x ou superior
- GCC/G++ (para compilar o módulo C++)
- libzip-dev (biblioteca para manipulação de arquivos ZIP em C++)

## Instalação

1. Clone o repositório:
```
git clone https://github.com/seu-usuario/SuperZip.git
cd SuperZip
```

2. Instale as dependências do Node.js:
```
npm install
```

3. Instale a biblioteca libzip para o módulo C++:
```
# Ubuntu/Debian
sudo apt-get install libzip-dev

# CentOS/RHEL
sudo yum install libzip-devel

# macOS
brew install libzip
```

4. Compile o módulo C++:
```
cd modules/cpp
make
cd ../..
```

## Uso

1. Inicie o servidor:
```
node server.js
```

2. Acesse a aplicação em http://localhost:3000

3. Faça upload de um arquivo ZIP protegido por senha e de uma word list

4. Selecione a linguagem desejada e inicie o teste

5. Visualize o progresso em tempo real e os resultados comparativos

## Estrutura do Projeto

```
SuperZip/
├── modules/                # Módulos para quebra de senha
│   ├── nodejs/             # Implementação em Node.js
│   └── cpp/                # Implementação em C++
├── public/                 # Arquivos públicos (CSS, JS, uploads)
│   ├── css/                # Estilos CSS
│   ├── js/                 # JavaScript do cliente
│   └── uploads/            # Pasta para arquivos enviados
├── views/                  # Templates EJS
├── server.js               # Servidor principal
├── package.json            # Dependências do projeto
└── README.md               # Documentação
```

## Contribuição

Contribuições são bem-vindas! Para contribuir:

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Faça commit das suas alterações (`git commit -m 'Adiciona nova feature'`)
4. Envie para o branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## Licença

Este projeto está licenciado sob a MIT License. 

