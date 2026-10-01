# Vouchers com várias utilizações

Ao criar ou editar um voucher, «Limite de utilizações» define o número máximo de
reservas que o podem usar. O valor inicial é 1. A tabela e os cartões de telemóvel
mostram as utilizações registadas e o limite, por exemplo `3 / 10`.

O voucher permanece ativo até atingir o limite; nessa altura aparece como
«Esgotado». É possível aumentar o limite para disponibilizar mais utilizações.
O limite não pode ser inferior às utilizações já registadas. Validade, mínimo de
noites e restrições de alojamento continuam a ser verificados.

«Ver reservas» abre o histórico paginado de utilizações, com hóspede, alojamento,
datas e estado da reserva. Cada reserva existente tem um botão para abrir a sua
ficha. Uma reserva eliminada mantém a referência no histórico, sem ligação para
uma ficha inexistente. Cancelar ou eliminar reservas não repõe utilizações.

As reservas internas e públicas partilham o mesmo limite. A utilização é registada
na transação da reserva; pedidos concorrentes não ultrapassam o limite e repetir
a aplicação na mesma reserva não consome outra utilização. Códigos inválidos ou
esgotados são rejeitados, em vez de criar silenciosamente a reserva sem desconto.

A migração mantém os vouchers anteriores com limite 1 e recupera a utilização já
registada. Backups de versão 5 incluem os limites e o histórico; as versões 3 e 4
continuam a ser aceites e o seu registo único é convertido para o novo histórico.

Validação: `npm test`, `npm run check` e `node scripts/check-vouchers.cjs` em
`backend/src`. O teste de navegador usa uma base descartável e verifica criação,
edição, contagem, esgotamento, reativação e navegação entre histórico e reservas,
em desktop e telemóvel.
