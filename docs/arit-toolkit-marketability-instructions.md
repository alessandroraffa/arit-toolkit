# ARIT Toolkit — Istruzioni per migliorare la vendibilità

## Contesto

ARIT Toolkit è un'estensione VS Code che combina due funzionalità:

1. Creazione di file e cartelle con prefisso timestamp
2. Archiviazione automatica delle sessioni degli AI coding assistants nel workspace

L'estensione è in fase iniziale, con zero stelle e pochi download. Il marketplace VS Code è saturo di estensioni generiche, quindi la comunicazione deve essere chirurgica.

### Analisi competitiva

- La feature di timestamp ha un concorrente diretto: "TimeStamp File / Folder" di 2001Y (168 installazioni). Offre funzionalità simili ma senza alcun legame con l'agentic coding.
- La feature di archiviazione sessioni AI non ha concorrenti nel marketplace. VS Code ha iniziato a integrare una vista "Agent Sessions" nativa, ma è limitata a Copilot e non salva file nel workspace.
- Il nome "toolkit" è usato da estensioni corporate di grandi dimensioni (AI Toolkit di Microsoft, AWS Toolkit, ecc.). Non c'è conflitto diretto, ma il termine è rumoroso.

### Tema unificante deciso dall'autore

L'estensione va posizionata sotto il tema dell'**agentic coding** e della **documentazione come artifact di progetto**: tutto ciò che ARIT Toolkit fa serve a produrre, organizzare e preservare la documentazione generata durante il lavoro di sviluppo assistito dall'AI.

## Istruzioni operative

### 1. README.md — Ristrutturazione completa

Il README attuale è funzionale ma non commerciale. Va riscritto mantenendo tutte le informazioni tecniche ma cambiando radicalmente struttura e tono.

#### 1.1 Apertura (prime 5 righe)

Le prime righe del README sono le uniche visibili nel marketplace senza scrollare. Devono catturare chi cerca una soluzione, non descrivere cos'è l'estensione.

Sostituire l'attuale apertura generica ("A collection of productivity utilities for Visual Studio Code") con un'apertura centrata sul problema:

- Enunciare il problema: le sessioni di chat con gli AI coding assistants (Claude Code, Cline, Aider, Roo Code, Copilot, Continue) si disperdono in percorsi diversi del filesystem e non fanno parte del progetto.
- Enunciare la soluzione: ARIT Toolkit le raccoglie automaticamente nel workspace come artifact di progetto, organizzate per data.
- Menzionare subito gli assistenti supportati (l'elenco dei nomi è keyword-rich e aiuta la discoverability).

Non usare frasi come "powerful", "ultimate", "game-changer" o altri aggettivi vuoti.

#### 1.2 Tema narrativo

Dopo l'apertura, inserire un breve paragrafo (3-4 righe) che connette le due anime dell'estensione sotto il tema unificante:

- Nel contesto dell'agentic coding, la documentazione non è un afterthought ma un artifact di progetto: meeting notes, decision logs, sessioni AI archiviate.
- ARIT Toolkit automatizza la produzione e l'organizzazione di questi artifact, che si tratti di creare un nuovo file di note con timestamp o di archiviare una sessione di Claude Code.

Questo paragrafo giustifica la coesistenza delle due feature e dà coerenza all'estensione.

#### 1.3 Struttura delle feature

Riorganizzare le feature in ordine di impatto, non in ordine cronologico di implementazione:

1. Agent Sessions Archiving (la feature killer, va prima)
2. Timestamped File & Folder Creator
3. Prefix Creation Timestamp
4. Extension Toggle & Status Bar

Per ogni feature:

- Titolo conciso
- Una frase che spiega il "perché" (il problema che risolve), non solo il "cosa"
- Dettagli tecnici (usage, configurazione, esempi)

Esempio di frase "perché" per l'archiviazione sessioni: "Le sessioni di chat con gli AI assistants vivono in cartelle sparse del sistema e non sopravvivono a un cambio di macchina o a un cleanup. Agent Sessions Archiving le copia automaticamente nel workspace, trasformandole in artifact di progetto versionabili con Git."

#### 1.4 Tabella degli assistenti supportati

La tabella degli assistenti supportati è un asset importante. Mantenerla, ma spostarla più in alto (subito dopo la descrizione della feature di archiviazione) perché funziona come checklist per l'utente: "il mio assistente è supportato?". Aggiungere una nota su come richiedere il supporto per altri assistenti (issue su GitHub).

#### 1.5 Sezione "Why ARIT Toolkit"

Aggiungere una breve sezione (facoltativa ma consigliata) che spiega il valore differenziante senza essere promozionale. Punti da coprire:

- Unica estensione che archivia sessioni di 6+ AI assistants in un unico punto
- I file archiviati sono nel workspace, quindi versionabili con Git e condivisibili nel team
- I timestamp danno una timeline consultabile del lavoro fatto
- Configurazione minimale: un file `.arit-toolkit.jsonc` e via

#### 1.6 Sezione "What's Next" / Roadmap

Aggiungere una sezione breve che comunica direzione e vitalità del progetto. Suggerimenti per possibili item (l'autore sceglierà quali includere):

- Ricerca full-text nelle sessioni archiviate
- Supporto per altri assistenti (Cursor, Windsurf, etc.)
- Dashboard riepilogativa delle sessioni
- Export delle sessioni in formato leggibile (markdown)
- Statistiche sull'utilizzo degli assistenti nel progetto

#### 1.7 Sezione ARIT

Mantenere la spiegazione dell'acronimo ARIT (Alessandro Raffa Information Technologies), ma spostarla in fondo, nella sezione Author o in un paragrafo dedicato. Non deve essere la prima cosa che il lettore incontra.

#### 1.8 Tono e stile

- Scrivere in inglese (lingua del marketplace)
- Tono diretto e tecnico, senza hype
- Frasi corte, paragrafi corti
- Non ripetere informazioni tra le sezioni
- Usare bold solo per i nomi dei comandi e delle feature, non per enfasi generica

### 2. package.json — Keywords e metadata

#### 2.1 Keywords

Il campo `keywords` nel `package.json` è critico per la discoverability nel marketplace (massimo 5 keyword). Scegliere le 5 più rilevanti tra queste candidate:

- `ai`
- `agent`
- `session`
- `archive`
- `timestamp`
- `productivity`
- `documentation`

Criterio: privilegiare i termini che un utente cercherebbe per trovare questa estensione. "ai" e "agent" sono i più cercati in assoluto nel marketplace in questo momento.

#### 2.2 Description

Il campo `description` nel `package.json` appare nei risultati di ricerca del marketplace. Deve essere una singola frase incisiva (max 200 caratteri) che menzioni la feature killer.

Esempio: "Archive AI coding sessions (Claude Code, Cline, Aider, Copilot, and more) into your workspace. Timestamped file and folder management included."

Non usare: "A collection of productivity utilities" o simili.

#### 2.3 Categories

Verificare che il campo `categories` sia impostato su `["Other"]` o valutare `["Other", "SCM Providers"]` se applicabile. La categoria influenza dove l'estensione appare nel marketplace.

#### 2.4 Tags / Topics su GitHub

Aggiungere i seguenti topics al repository GitHub: `vscode-extension`, `ai`, `agentic-coding`, `developer-tools`, `productivity`, `timestamp`, `session-archiving`, `claude-code`, `copilot`, `cline`, `aider`.

### 3. Documentazione collegata

#### 3.1 CHANGELOG.md

Verificare che il CHANGELOG sia ben strutturato e aggiornato. Un changelog curato comunica che il progetto è attivo. Usare il formato Keep a Changelog se non è già in uso.

#### 3.2 CONTRIBUTING.md

Nessuna modifica necessaria, ma verificare che sia coerente con il nuovo posizionamento.

#### 3.3 Marketplace page

La pagina del marketplace viene generata dal README. Dopo aver aggiornato il README, verificare che il rendering nel marketplace sia corretto (le immagini si vedano, i link funzionino, la formattazione non sia rotta).

### 4. Checklist finale

Dopo aver applicato tutte le modifiche, verificare:

- [ ] Le prime 5 righe del README parlano del problema, non dell'estensione
- [ ] L'archiviazione sessioni AI è la prima feature presentata
- [ ] La tabella degli assistenti supportati è visibile senza molto scrolling
- [ ] Le keyword nel package.json sono state aggiornate
- [ ] La description nel package.json è stata aggiornata
- [ ] I topic del repository GitHub sono stati aggiornati
- [ ] La spiegazione dell'acronimo ARIT è in fondo, non in cima
- [ ] Non ci sono frasi generiche tipo "collection of productivity utilities"
- [ ] Il tono è diretto e tecnico, senza hype
- [ ] La sezione roadmap/what's next è presente
