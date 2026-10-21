# Documento de teste das construções

**Status:** pendente de validação com a liderança.

Parágrafo com **negrito**, *itálico*, ~~tachado~~, `código inline` e um [link externo](https://exemplo.com/caminho?x=1). Também um [link para outro documento](matriz-evidencias.md) e um texto com acentos: ação, coração, órgão, São Paulo, Ç, ã, õ.

Quebra de linha forçada  
na mesma parágrafo, e setas → ← ↔, operadores ≈ ≠ ≤ ≥ − ×, símbolos ■ ▼ ►, aspas “curvas” e reticências… e travessão — fim.

Símbolo sem glifo no PDF: emoji 📘 e 😍 devem sumir do PDF, mas o Word mantém. Marcadores do deck: ⟦ETAPA 2⟧ e fluxo A ➔ B.

## Títulos de nível dois

### Nível três

#### Nível quatro

##### Nível cinco

###### Nível seis

- Item simples
- Item com **negrito** e `código`
  - Subitem nível dois
    - Subitem nível três
- Terceiro item

1. Primeiro numerado
2. Segundo numerado
3. Terceiro numerado

Lista numerada após parágrafo, começando em três:

3. Lista que começa em três
4. Quarto item

- [x] Tarefa concluída
- [ ] Tarefa pendente
- [ ] Tarefa com **destaque**

> Citação simples com texto em *itálico*.
>
> > Citação aninhada.
>
> - Item dentro da citação

---

| Coluna à esquerda | Coluna central | Valor |
| :--- | :---: | ---: |
| EV-001 | Caso observado | 1.250,00 € |
| EV-002 | Hipótese | 0 |
|  | Célula vazia à esquerda | — |
| Texto longo para forçar quebra de linha dentro da célula da tabela do documento | Outra | ✓ |

```
Árvore de pastas
├── AIOS/
│   ├── inventario-ferramentas-e-uso-ia.md
│   └── modelo-coi-roi.md
└── Entregaveis/
    └── README.md
```

```ts
const soma = (a: number, b: number) => a + b; // comentário
	indentado com tabulação
```

Texto com comentário HTML <!-- nota interna --> que não deve aparecer na exportação, e código com `<conta>` que deve aparecer literal.

Referência de rodapé[^1] e definição de link [referência][ref].

[^1]: Texto da nota de rodapé.

[ref]: https://exemplo.com/referencia
