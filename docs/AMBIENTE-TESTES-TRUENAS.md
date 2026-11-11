# Produção e testes no TrueNAS

Preparação em 11/11/2026. Produção existente confirmada por SSH:
`/mnt/Main pool/apps/santa-paciencia`, ramo `claude/adoring-ride-pchzjc`,
commit `a393db1`, com alterações locais no `docker-compose.yml`.
Não mudar de ramo nem substituir esse ficheiro durante esta instalação.
A produção ainda não está em `main`; essa mudança é uma operação futura.

## Separação

| Recurso | Produção | Testes |
| --- | --- | --- |
| Código | Pasta atual | `/mnt/Main pool/apps/santa-paciencia-testes` |
| Ramo | Atual, conservado | `testes` |
| Compose | `docker-compose.yml` atual | `compose.staging.yml` independente |
| Projeto Docker | Atual, conservado | `santa-paciencia-testes` |
| Porta | Atual, observada em `192.168.1.81:3001` | `127.0.0.1:3002` no TrueNAS |
| Base/ficheiros | Montagens atuais, conservadas | Volume Docker `santa-paciencia-testes_staging-data` |
| Base interna | Atual | `/app/data/staging.db` |
| Configuração | Ficheiros atuais, conservados | `.env.staging`, criado de raiz, modo 0600 |
| Endereço pretendido | Atual | `https://testes.santapaciencia.xyz` |

O Compose de testes não inclui `cloudflared`, não monta pastas de produção,
não reutiliza o nome da imagem/projeto e não publica a porta em interfaces LAN.
Usar sempre o wrapper `scripts/staging.sh`, que fixa `-f`, `-p` e `--env-file`.
O comando simples `docker compose up` na pasta de testes escolheria o ficheiro
padrão de produção, por isso não o usar nesta instalação.

## Instalação

O código pode chegar por clone do ramo `testes` no mesmo repositório, depois de
o ramo ser publicado. Enquanto não há credenciais de escrita GitHub,
a preparação pode ser transferida por Git bundle e clonada na pasta de testes.
Essa cópia tem commits e ramo locais, mas isso não publica o ramo no GitHub.

Dentro da nova pasta:

```sh
sh scripts/staging.sh init
sh scripts/staging.sh check
sudo sh scripts/staging.sh install
```

`install` constrói e arranca apenas o projeto de testes, espera pelo healthcheck
e cria uma conta nova de Administração + proprietário num estabelecimento vazio.
Email: `admin@testes.invalid`. A palavra-passe é aleatória e aparece uma única
vez no terminal. Guardá-la; repetir o comando conserva a conta existente.
O script de conta recusa correr em produção ou noutra base.

Não copiar `.env`, `data`, `tokens`, backups ou credenciais do alojamento real.
O código de testes bloqueia email, Google, Stripe, leitura de talões, push e
importação de backups de clientes. O arranque recusa credenciais externas.
O estado HTTP inclui `X-App-Environment: staging` e `X-Robots-Tag: noindex`.
Usa o mesmo modo de execução `NODE_ENV=production`, cookies HTTPS e migrações.

## Cloudflare Tunnel

A instalação só fica navegável por HTTPS depois de configurar o endereço.
No túnel existente, criar uma rota nova, preservando todas as rotas existentes:

- Hostname: `testes.santapaciencia.xyz`.
- Serviço: HTTP, `http://127.0.0.1:3002`.
- O conector deve executar na rede do host TrueNAS; confirmar esse ponto antes
  de adicionar a rota. O Compose do repositório usa `network_mode: host`.
- Proteger o hostname de testes com Cloudflare Access, permitindo apenas as
  pessoas autorizadas, antes de divulgar o endereço.

Não é necessário iniciar outro túnel com o token de produção. Se o conector
estiver noutro host ou numa rede sem acesso ao loopback, adaptar a ligação
após inspecionar a configuração, sem abrir a porta indiscriminadamente.
Sem acesso autenticado ao Cloudflare, esta rota não pode ser criada daqui.
DNS/noindex não constituem uma restrição de acesso; a autenticação da app
continua obrigatória.

## Utilização

```sh
cd "/mnt/Main pool/apps/santa-paciencia-testes"
sudo sh scripts/staging.sh status
sudo sh scripts/staging.sh logs
sudo sh scripts/staging.sh stop
```

Após publicar o ramo `testes` no GitHub:

```sh
sudo sh scripts/staging.sh update
```

A atualização exige ramo `testes` e ficheiros de código sem alterações locais.
Faz `pull --ff-only` e reconstrói apenas este projeto. Quando executada com sudo,
o Git pull é feito como o utilizador original, mantendo as permissões dos ficheiros.
As configurações/volumes sobrevivem à reconstrução. Não há comandos automáticos
de apagar volumes ou copiar dados de produção.

Os testes internos ainda não produzem emails nem cobram pagamentos. Para testar
integrações externas no futuro será necessário desenhar uma configuração com
contas de teste próprias e alterar explicitamente a política de staging.

## Publicação futura em produção

Aprovar uma versão identificada por commit. Antes de alterar a produção,
resolver a estratégia do ramo atual e as mudanças locais no Compose, verificar
as migrações e fazer backup com restauro verificável. A produção recebe o código
aprovado, nunca a base ou os ficheiros fictícios dos testes.
