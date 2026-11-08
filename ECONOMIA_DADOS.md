# Economia de dados — Radio Hits 2.6

**Dados: ECO** ativa áudio AAC-LC de 48 kbps, gerado apenas no GitHub Pages.
No Android e iPhone o modo começa ativado; o usuário pode desativá-lo.
As músicas originais não são alteradas, e os downloads offline existentes têm prioridade.
A alteração vale na próxima música para não interromper a reprodução.
Com 48 kbps, o consumo teórico de áudio é de cerca de 0,36 MB por minuto (mais overhead de rede). A qualidade é reduzida em comparação à original.
Arquivos leves são preparados no dist/musicas-leves/ pelo GitHub Actions e não são gravados no repositório.
O PWA cacheia JS, CSS e capas; o catálogo é revalidado automaticamente a cada hora ou sob pedido do usuário.
Cache automático nunca guarda arquivos musicais nem descarrega a biblioteca inteira.
A publicação falha caso o tamanho ultrapasse o limite operacional de 950 MiB, sem excluir músicas.
Distribua somente músicas para as quais tem autorização. Compactar não concede direitos.

Testes: node tests/teste-economia-dados.js e python tests/test_audio_leve.py.
