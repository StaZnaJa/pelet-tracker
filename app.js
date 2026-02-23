// Glavna aplikacija Pelet Tracker - VERZIJA SA KUPLJENO/PRENETO I CENAMA
// KOMPLETNA VERZIJA SA PWA PODRŠKOM

class PeletTracker {
    constructor() {
        this.state = dataManager.loadData();
        this.chart = null;
        this.currentMonthView = new Date();
        this.eventListeners = new Map();
        this.seasonLastView = {};
        this.isLoading = false;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.osveziSezonaSelect();
        
        if (Object.keys(this.state.seasons).length === 0) {
            this.addSampleData();
        } else if (this.state.activeSeasonId) {
            document.getElementById('sezonaSelect').value = this.state.activeSeasonId;
            this.ucitajSezonu();
        }
        
        this.initOfflineSync();
        
        window.addEventListener('online', () => {
            this.debounce(() => {
                this.renderRezime();
                this.renderStatistika();
                this.renderChart();
            }, 300)();
        });
        
        if (this.isRunningAsPWA()) {
            console.log('Aplikacija pokrenuta kao PWA');
            document.body.classList.add('pwa-mode');
        }
    }

    isRunningAsPWA() {
        return window.matchMedia('(display-mode: standalone)').matches || 
               window.navigator.standalone === true ||
               document.referrer.includes('android-app://');
    }

    initOfflineSync() {
        if (this.state.activeSeasonId) {
            localStorage.setItem('pelet_last_active', this.state.activeSeasonId);
        }
        
        setInterval(() => {
            if (this.state) {
                dataManager.saveData(this.state);
                console.log('Offline backup: podaci sačuvani');
            }
        }, 60000);
        
        const lastSeason = localStorage.getItem('pelet_last_active');
        if (lastSeason && !this.state.activeSeasonId && this.state.seasons[lastSeason]) {
            this.state.activeSeasonId = lastSeason;
            setTimeout(() => {
                const select = document.getElementById('sezonaSelect');
                if (select) select.value = lastSeason;
                this.ucitajSezonu();
            }, 500);
        }
    }

    setupEventListeners() {
        this.addEventListener('dodajSezonuBtn', 'click', () => this.dodajSezonu());
        this.addEventListener('sezonaSelect', 'change', () => this.ucitajSezonu());
        this.addEventListener('izveziJSON', 'click', () => this.exportJSON());
        this.addEventListener('uveziJSON', 'click', () => this.importJSON());
        this.addEventListener('obrisiSezonu', 'click', () => this.obrisiSezonu());
        this.addEventListener('resetSve', 'click', () => this.resetSve());
        this.addEventListener('bulkEditBtn', 'click', () => this.showBulkEdit());
        this.addEventListener('autoFillBtn', 'click', () => this.autoFillTemperatures());
        this.addEventListener('applyBulkBtn', 'click', () => this.applyBulkEdit());
        this.addEventListener('cancelBulkBtn', 'click', () => UIHelpers.hideModal('bulkEditModal'));
        this.addEventListener('dodajTemperatureBtn', 'click', () => this.dodajTemperatureZaSezonu());
        this.addEventListener('undoDeleteBtn', 'click', () => this.undoDelete());
        this.addEventListener('showBackupsBtn', 'click', () => this.showBackups());
        this.addEventListener('closeBackupsBtn', 'click', () => UIHelpers.hideModal('backupsModal'));
        
        // DUGME ZA UPDATE POGREŠNIH TEMPERATURA
        const updateTempsBtn = document.getElementById('updatePogresneTemperatureBtn');
        if (updateTempsBtn) {
            this.addListenerToElement(updateTempsBtn, 'click', () => this.updatePogresneTemperature());
        }
        
        // DUGME ZA PRENOS ZALIHA
        const prenesiZaliheBtn = document.getElementById('prenesiZaliheBtn');
        if (prenesiZaliheBtn) {
            this.addListenerToElement(prenesiZaliheBtn, 'click', () => this.prikaziPrenosZaliha());
        }
        
        // DUGME ZA IZMENU KOLIČINE
        const izmeniKolicinuBtn = document.getElementById('izmeniKolicinuBtn');
        if (izmeniKolicinuBtn) {
            this.addListenerToElement(izmeniKolicinuBtn, 'click', () => this.prikaziIzmenuKolicine());
        }
        
        // DUGME ZA UNOS CENE
        const unesiCenuBtn = document.getElementById('unesiCenuBtn');
        if (unesiCenuBtn) {
            this.addListenerToElement(unesiCenuBtn, 'click', () => this.prikaziUnosCene());
        }
        
        const importConvertedBtn = document.getElementById('importConvertedBtn');
        if (importConvertedBtn) {
            this.addListenerToElement(importConvertedBtn, 'click', () => this.importConvertedData());
        }
        
        document.querySelectorAll('.modal-close').forEach(btn => {
            this.addListenerToElement(btn, 'click', () => {
                btn.closest('.modal').classList.remove('active');
            });
        });
        
        document.querySelectorAll('.modal').forEach(modal => {
            this.addListenerToElement(modal, 'click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });
    }

    addEventListener(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            this.addListenerToElement(element, event, handler);
        }
    }

    addListenerToElement(element, event, handler) {
        element.addEventListener(event, handler);
        const key = `${event}_${Date.now()}`;
        this.eventListeners.set(key, { element, event, handler });
    }

    cleanupEventListeners() {
        this.eventListeners.forEach((listener, key) => {
            listener.element.removeEventListener(listener.event, listener.handler);
            this.eventListeners.delete(key);
        });
    }

    getActiveSeason() {
        return this.state.seasons[this.state.activeSeasonId] || null;
    }

    // Ukupna zaliha = kupljeno + preneto
    getUkupnaZaliha(season) {
        return (season.zalihe?.kupljeno || 0) + (season.zalihe?.preneto || 0);
    }

    // Preostalo = ukupno - potrošnja
    getPreostalo(season) {
        const ukupno = this.getUkupnaZaliha(season);
        const potrosnja = Object.values(season.days || {}).reduce((sum, dan) => sum + (dan.potrosnja || 0), 0);
        return ukupno - potrosnja;
    }

    addSampleData() {
        const currentYear = new Date().getFullYear();
        const seasonId = `Sezona ${currentYear-1}/${currentYear}`;
        
        const sampleSeason = {
            id: seasonId,
            naziv: seasonId,
            period: {
                start: `${currentYear-1}-10-01`,
                end: `${currentYear}-04-30`
            },
            zalihe: {
                kupljeno: 100,
                preneto: 0,
                cena: {
                    poTon: 0,
                    poPaleti: 0,
                    valuta: 'RSD'
                }
            },
            days: {},
            meta: {
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        };
        
        const start = new Date(`${currentYear-1}-10-01`);
        const end = new Date(`${currentYear}-04-30`);
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            
            sampleSeason.days[dateStr] = {
                potrosnja: Math.random() > 0.7 ? parseFloat((Math.random() * 3).toFixed(2)) : 0,
                temperatura: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
        }
        
        this.state.seasons[seasonId] = sampleSeason;
        this.state.activeSeasonId = seasonId;
        dataManager.saveData(this.state);
        
        this.osveziSezonaSelect();
        document.getElementById('sezonaSelect').value = seasonId;
        this.ucitajSezonu();
    }

    // ========== IZMENJENA METODA ZA DODAVANJE SEZONE ==========
    async dodajSezonu() {
        const seasonData = {
            id: UIHelpers.sanitizeHTML(document.getElementById('novaSezonaID').value.trim()),
            pocetniDatum: document.getElementById('pocetakGrejanja').value,
            krajDatum: document.getElementById('krajGrejanja').value,
            kupljeno: parseFloat(document.getElementById('kupljenoDzakova').value) || 0
        };
        
        const existingSeasons = Object.values(this.state.seasons);
        const errors = Validation.validateSeasonData({
            id: seasonData.id,
            pocetniDatum: seasonData.pocetniDatum,
            krajDatum: seasonData.krajDatum,
            pocetnaKolicina: seasonData.kupljeno
        }, existingSeasons);
        
        if (errors.length > 0) {
            UIHelpers.showAlert(errors.join('<br>'), 'error');
            return;
        }
        
        const exists = this.state.seasons[seasonData.id];
        if (exists) {
            if (!confirm(`Sezona "${seasonData.id}" već postoji. Želite li da je zamenite?`)) {
                return;
            }
        }
        
        // --- POČETAK IZMENE: Automatski pronađi prethodnu sezonu i izračunaj preneto ---
        let preneto = 0;
        let prethodnaSezonaId = null;
        
        const sezone = Object.values(this.state.seasons);
        if (sezone.length > 0) {
            // Sortiraj po datumu početka (najnovija prvo) da nađemo poslednju sezonu
            sezone.sort((a, b) => new Date(b.period.start) - new Date(a.period.start));
            prethodnaSezonaId = sezone[0].id; // Uzimamo prvu (najnoviju) sezonu kao prethodnu
            
            const prethodna = this.state.seasons[prethodnaSezonaId];
            if (prethodna) {
                const preostalo = this.getPreostalo(prethodna);
                if (preostalo > 0) {
                    preneto = preostalo;
                    UIHelpers.showAlert(`Automatski preneto ${preostalo.toFixed(2)} džakova iz sezone "${prethodnaSezonaId}" u stavku "Preneto"`, 'info');
                }
            }
        }
        // --- KRAJ IZMENE ---
        
        const novaSezona = {
            id: seasonData.id,
            naziv: seasonData.id,
            period: {
                start: seasonData.pocetniDatum,
                end: seasonData.krajDatum
            },
            zalihe: {
                kupljeno: seasonData.kupljeno,
                preneto: preneto, // <-- Automatski popunjeno
                cena: {
                    poTon: 0,
                    poPaleti: 0,
                    valuta: 'RSD'
                }
            },
            days: {},
            meta: {
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        };
        
        const start = new Date(seasonData.pocetniDatum);
        const end = new Date(seasonData.krajDatum);
        
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            novaSezona.days[dateStr] = {
                potrosnja: 0,
                temperatura: 0,
                createdAt: new Date().toISOString()
            };
        }
        
        this.state.seasons[seasonData.id] = novaSezona;
        this.state.activeSeasonId = seasonData.id;
        dataManager.saveData(this.state);
        
        this.osveziSezonaSelect();
        document.getElementById('sezonaSelect').value = seasonData.id;
        this.ucitajSezonu();
        
        document.getElementById('novaSezonaID').value = '';
        UIHelpers.showAlert(`Sezona "${seasonData.id}" je uspešno kreirana!`, 'success');
        
        setTimeout(() => {
            if (confirm(`Želite li da unesete cenu peleta za ovu sezonu?`)) {
                this.prikaziUnosCene();
            }
        }, 1000);
    }

    // ========== NOVA METODA ZA UNOS CENE ==========
    prikaziUnosCene() {
        const season = this.getActiveSeason();
        if (!season) {
            UIHelpers.showAlert('Izaberite sezonu', 'error');
            return;
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-tag"></i> Cena peleta</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="info-banner" style="margin-bottom: 15px;">
                        <i class="fas fa-info-circle"></i>
                        <span>Sezona: <strong>${UIHelpers.escapeHTML(season.id)}</strong></span>
                    </div>
                    
                    <div class="form-group">
                        <label>Valuta:</label>
                        <select id="cenaValuta" class="form-input">
                            <option value="RSD" ${season.zalihe?.cena?.valuta === 'RSD' ? 'selected' : ''}>RSD</option>
                            <option value="EUR" ${season.zalihe?.cena?.valuta === 'EUR' ? 'selected' : ''}>EUR</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="cenaPoTon">Cena po toni (15kg džak = 0.015t):</label>
                        <input type="number" id="cenaPoTon" min="0" step="10" 
                               value="${season.zalihe?.cena?.poTon || 0}" class="form-input">
                        <small class="form-help">1 tona = 66.67 džakova</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="cenaPoPaleti">Cena po paleti (70 džakova):</label>
                        <input type="number" id="cenaPoPaleti" min="0" step="100" 
                               value="${season.zalihe?.cena?.poPaleti || 0}" class="form-input">
                        <small class="form-help">1 paleta = ${PALETA_DZAKOVA} džakova = ${PALETA_KG}kg</small>
                    </div>
                    
                    <div class="info-banner" style="margin-top: 15px;">
                        <i class="fas fa-calculator"></i>
                        <span id="cenaPreview">Ukupna vrednost: 0</span>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="otkaziCenuBtn" class="btn btn-secondary">Otkaži</button>
                    <button id="sacuvajCenuBtn" class="btn btn-primary">Sačuvaj cenu</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Preview za ukupnu cenu
        const izracunajPreview = () => {
            const poTon = parseFloat(modal.querySelector('#cenaPoTon').value) || 0;
            const poPaleti = parseFloat(modal.querySelector('#cenaPoPaleti').value) || 0;
            const valuta = modal.querySelector('#cenaValuta').value;
            
            const ukupnoDzaka = this.getUkupnaZaliha(season);
            const ukupnoTona = ukupnoDzaka * DZAK_KG / 1000;
            const ukupnoPaleta = ukupnoDzaka / PALETA_DZAKOVA;
            
            let vrednost = 0;
            if (poTon > 0) {
                vrednost = ukupnoTona * poTon;
            } else if (poPaleti > 0) {
                vrednost = ukupnoPaleta * poPaleti;
            }
            
            modal.querySelector('#cenaPreview').innerHTML = `
                Ukupna vrednost: ${UIHelpers.formatCena(vrednost, valuta)}<br>
                <small>${ukupnoDzaka.toFixed(2)} džakova = ${ukupnoTona.toFixed(2)}t = ${ukupnoPaleta.toFixed(2)} paleta</small>
            `;
        };
        
        modal.querySelector('#cenaPoTon').addEventListener('input', izracunajPreview);
        modal.querySelector('#cenaPoPaleti').addEventListener('input', izracunajPreview);
        
        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        
        modal.querySelector('#otkaziCenuBtn').addEventListener('click', () => modal.remove());
        
        modal.querySelector('#sacuvajCenuBtn').addEventListener('click', () => {
            const poTon = parseFloat(modal.querySelector('#cenaPoTon').value) || 0;
            const poPaleti = parseFloat(modal.querySelector('#cenaPoPaleti').value) || 0;
            const valuta = modal.querySelector('#cenaValuta').value;
            
            if (!season.zalihe) season.zalihe = {};
            if (!season.zalihe.cena) season.zalihe.cena = {};
            
            season.zalihe.cena.poTon = poTon;
            season.zalihe.cena.poPaleti = poPaleti;
            season.zalihe.cena.valuta = valuta;
            season.meta.updatedAt = new Date().toISOString();
            
            dataManager.saveData(this.state);
            this.renderRezime();
            modal.remove();
            
            UIHelpers.showAlert('Cena uspešno sačuvana', 'success');
        });
        
        izracunajPreview();
    }

    // ========== IZMENJENA METODA ZA PRENOS ZALIHA ==========
    async prikaziPrenosZaliha() {
        const sezone = Object.values(this.state.seasons);
        
        if (sezone.length < 2) {
            UIHelpers.showAlert('Potrebne su najmanje dve sezone za prenos zaliha', 'error');
            return;
        }
        
        sezone.sort((a, b) => new Date(a.period.start) - new Date(b.period.start));
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-exchange-alt"></i> Prenos zaliha</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Izaberite izvornu sezonu (sa zalihama):</label>
                        <select id="izvornaSezonaSelect" class="form-input">
                            ${sezone.map(s => {
                                const preostalo = this.getPreostalo(s);
                                return `<option value="${s.id}">${s.id} (preostalo ${preostalo.toFixed(2)} džakova)</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Izaberite ciljnu sezonu (u koju prenosite):</label>
                        <select id="ciljnaSezonaSelect" class="form-input">
                            ${sezone.map(s => `<option value="${s.id}">${s.id}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Količina za prenos (džakovi):</label>
                        <input type="number" id="kolicinaPrenosa" min="0" step="0.1" class="form-input" placeholder="Ostavite prazno za sav preostali pelet">
                        <small class="form-help">Prenete zalihe se dodaju u stavku "preneto" ciljne sezone</small>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="otkaziPrenosBtn" class="btn btn-secondary">Otkaži</button>
                    <button id="izvrsiPrenosBtn" class="btn btn-primary">Izvrši prenos</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        
        modal.querySelector('#otkaziPrenosBtn').addEventListener('click', () => modal.remove());
        
        modal.querySelector('#izvrsiPrenosBtn').addEventListener('click', () => {
            const izvornaId = modal.querySelector('#izvornaSezonaSelect').value;
            const ciljnaId = modal.querySelector('#ciljnaSezonaSelect').value;
            const kolicinaInput = modal.querySelector('#kolicinaPrenosa').value;
            
            let kolicina = kolicinaInput ? parseFloat(kolicinaInput) : null;
            
            if (izvornaId === ciljnaId) {
                UIHelpers.showAlert('Izvorna i ciljna sezona moraju biti različite', 'error');
                return;
            }
            
            this.izvrsiPrenosZaliha(izvornaId, ciljnaId, kolicina);
            modal.remove();
        });
    }

    async izvrsiPrenosZaliha(izvornaId, ciljnaId, kolicina = null) {
        const izvorna = this.state.seasons[izvornaId];
        const ciljna = this.state.seasons[ciljnaId];
        
        if (!izvorna || !ciljna) {
            UIHelpers.showAlert('Sezone nisu pronađene', 'error');
            return;
        }
        
        const preostaloUIzvornoj = this.getPreostalo(izvorna);
        
        if (preostaloUIzvornoj <= 0) {
            UIHelpers.showAlert('Nema preostalih zaliha u izvornoj sezoni', 'error');
            return;
        }
        
        let kolicinaZaPrenos = kolicina;
        if (kolicinaZaPrenos === null || kolicinaZaPrenos > preostaloUIzvornoj) {
            kolicinaZaPrenos = preostaloUIzvornoj;
        }
        
        if (kolicinaZaPrenos <= 0) {
            UIHelpers.showAlert('Količina za prenos mora biti pozitivna', 'error');
            return;
        }
        
        if (!confirm(`Preneti ${kolicinaZaPrenos.toFixed(2)} džakova iz "${izvornaId}" u "${ciljnaId}"?`)) {
            return;
        }
        
        // NE smanjujemo kupljeno, već će se preneto automatski pojaviti u razlici
        // ali pošto ne menjamo ništa u izvornoj, preneto će ostati u izvornoj kao preostalo
        
        // U ciljnu sezonu dodajemo u preneto
        if (!ciljna.zalihe) ciljna.zalihe = { kupljeno: 0, preneto: 0, cena: {} };
        ciljna.zalihe.preneto = (ciljna.zalihe.preneto || 0) + kolicinaZaPrenos;
        
        // Ažuriraj meta podatke
        izvorna.meta.updatedAt = new Date().toISOString();
        ciljna.meta.updatedAt = new Date().toISOString();
        
        dataManager.saveData(this.state);
        
        if (this.state.activeSeasonId === izvornaId || this.state.activeSeasonId === ciljnaId) {
            this.renderRezime();
            this.renderKalendar();
            this.renderStatistika();
            this.renderChart();
        }
        
        UIHelpers.showAlert(`Uspešno preneto ${kolicinaZaPrenos.toFixed(2)} džakova u stavku "preneto"`, 'success');
    }

    // ========== NOVA METODA ZA IZMENU KOLIČINE (KUPLJENO/PRENETO) ==========
    prikaziIzmenuKolicine() {
        const season = this.getActiveSeason();
        if (!season) {
            UIHelpers.showAlert('Izaberite sezonu', 'error');
            return;
        }
        
        const potrosnja = Object.values(season.days).reduce((sum, dan) => sum + (dan.potrosnja || 0), 0);
        const ukupno = this.getUkupnaZaliha(season);
        const preostalo = ukupno - potrosnja;
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-edit"></i> Izmena zaliha</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="info-banner" style="margin-bottom: 15px;">
                        <i class="fas fa-info-circle"></i>
                        <span>Sezona: <strong>${UIHelpers.escapeHTML(season.id)}</strong></span>
                    </div>
                    
                    <div class="stats-grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 15px;">
                        <div class="stat-item" style="background: rgba(0,0,0,0.3);">
                            <div class="stat-value" style="font-size: 1.2rem;">${UIHelpers.formatBroj(ukupno)}</div>
                            <div class="stat-label">Ukupno</div>
                        </div>
                        <div class="stat-item" style="background: rgba(0,0,0,0.3);">
                            <div class="stat-value" style="font-size: 1.2rem;">${UIHelpers.formatBroj(preostalo)}</div>
                            <div class="stat-label">Preostalo</div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="kupljenoKolicina">Kupljeno džakova:</label>
                        <input type="number" id="kupljenoKolicina" min="0" step="0.1" 
                               value="${season.zalihe?.kupljeno || 0}" class="form-input">
                    </div>
                    
                    <div class="form-group">
                        <label for="prenetoKolicina">Preneto iz prethodnih sezona:</label>
                        <input type="number" id="prenetoKolicina" min="0" step="0.1" 
                               value="${season.zalihe?.preneto || 0}" class="form-input">
                        <small class="form-help">Ova polja se automatski ažuriraju pri prenosu</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Potrošnja do sada:</label>
                        <input type="text" class="form-input" value="${UIHelpers.formatBroj(potrosnja)} džakova" readonly disabled style="background: rgba(0,0,0,0.2);">
                    </div>
                    
                    <div class="info-banner" style="margin-top: 15px;" id="novoPreostaloPreview">
                        Novo preostalo: ${UIHelpers.formatBroj(preostalo)} džakova
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="otkaziIzmenuBtn" class="btn btn-secondary">Otkaži</button>
                    <button id="sacuvajIzmenuBtn" class="btn btn-primary">Sačuvaj izmenu</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const izracunajPreview = () => {
            const kupljeno = parseFloat(modal.querySelector('#kupljenoKolicina').value) || 0;
            const preneto = parseFloat(modal.querySelector('#prenetoKolicina').value) || 0;
            const novoUkupno = kupljeno + preneto;
            const novoPreostalo = novoUkupno - potrosnja;
            
            const previewEl = modal.querySelector('#novoPreostaloPreview');
            previewEl.innerHTML = `Novo preostalo: ${UIHelpers.formatBroj(novoPreostalo)} džakova`;
            previewEl.style.background = novoPreostalo >= 0 ? 'rgba(0,176,155,0.2)' : 'rgba(231,76,60,0.2)';
        };
        
        modal.querySelector('#kupljenoKolicina').addEventListener('input', izracunajPreview);
        modal.querySelector('#prenetoKolicina').addEventListener('input', izracunajPreview);
        
        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        
        modal.querySelector('#otkaziIzmenuBtn').addEventListener('click', () => modal.remove());
        
        modal.querySelector('#sacuvajIzmenuBtn').addEventListener('click', () => {
            const kupljeno = parseFloat(modal.querySelector('#kupljenoKolicina').value) || 0;
            const preneto = parseFloat(modal.querySelector('#prenetoKolicina').value) || 0;
            
            if (kupljeno < 0 || preneto < 0) {
                UIHelpers.showAlert('Količine ne mogu biti negativne', 'error');
                return;
            }
            
            if (!season.zalihe) season.zalihe = {};
            season.zalihe.kupljeno = kupljeno;
            season.zalihe.preneto = preneto;
            season.meta.updatedAt = new Date().toISOString();
            
            dataManager.saveData(this.state);
            
            this.renderRezime();
            this.renderStatistika();
            this.renderPoredenje();
            this.renderChart();
            
            modal.remove();
            UIHelpers.showAlert('Zalihe uspešno izmenjene', 'success');
        });
        
        izracunajPreview();
    }

    osveziSezonaSelect() {
        const select = document.getElementById('sezonaSelect');
        const currentValue = select.value;
        
        select.innerHTML = '';
        
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '-- Izaberite sezonu --';
        select.appendChild(defaultOption);
        
        const seasonsArray = Object.values(this.state.seasons);
        seasonsArray
            .sort((a, b) => new Date(b.period.start) - new Date(a.period.start))
            .forEach(season => {
                const option = document.createElement('option');
                option.value = season.id;
                option.textContent = UIHelpers.escapeHTML(season.naziv || season.id);
                select.appendChild(option);
            });
        
        if (currentValue && this.state.seasons[currentValue]) {
            select.value = currentValue;
        } else if (this.state.activeSeasonId) {
            select.value = this.state.activeSeasonId;
        }
    }

    async ucitajSezonu() {
        if (this.isLoading) {
            console.log('Učitavanje je već u toku...');
            return;
        }
        
        const seasonId = document.getElementById('sezonaSelect').value;
        
        if (!seasonId) {
            this.state.activeSeasonId = null;
            dataManager.saveData(this.state);
            this.renderRezime();
            this.renderKalendar();
            this.renderStatistika();
            this.renderPoredenje();
            this.renderChart();
            return;
        }
        
        if (this.state.activeSeasonId === seasonId) {
            console.log('Ista sezona, samo osvežavam prikaz');
            this.renderRezime();
            this.renderKalendar();
            this.renderStatistika();
            this.renderPoredenje();
            this.renderChart();
            return;
        }
        
        this.isLoading = true;
        UIHelpers.showLoading(true, 'Učitavanje sezone...');
        
        try {
            this.state.activeSeasonId = seasonId;
            dataManager.saveData(this.state);
            
            const season = this.state.seasons[seasonId];
            if (!season) {
                throw new Error('Sezona nije pronađena');
            }
            
            if (season.period && season.period.start) {
                this.currentMonthView = new Date(season.period.start);
            }
            
            this.renderRezime();
            this.renderKalendar();
            this.renderStatistika();
            this.renderPoredenje();
            this.renderChart();
            
            UIHelpers.showLoading(false);
            
        } catch (error) {
            console.error('Error loading season:', error);
            UIHelpers.showAlert('Greška pri učitavanju sezone: ' + error.message, 'error');
            UIHelpers.showLoading(false);
        } finally {
            this.isLoading = false;
        }
    }

    async renderKalendar() {
        const container = document.getElementById('kalendarContainer');
        const season = this.getActiveSeason();
        
        if (!season) {
            container.innerHTML = '<div class="info-message"><i class="fas fa-calendar"></i><p>Izaberite sezonu za prikaz kalendara</p></div>';
            return;
        }
        
        this.renderMonthlyCalendar();
    }
    
    renderMonthlyCalendar() {
        const container = document.getElementById('kalendarContainer');
        let displayDate = this.currentMonthView;
        const season = this.getActiveSeason();
        
        if (!season) return;
        
        const year = displayDate.getFullYear();
        const month = displayDate.getMonth();
        const monthName = displayDate.toLocaleDateString('sr-RS', { month: 'long', year: 'numeric' });
        
        container.innerHTML = `
            <div class="calendar-controls">
                <button id="prevMonthBtn" class="btn-calendar-nav">
                    <i class="fas fa-chevron-left"></i> Prethodni
                </button>
                <div class="calendar-title">
                    <h3><i class="fas fa-calendar-alt"></i> ${monthName}</h3>
                    <button id="currentMonthBtn" class="btn-calendar-today">
                        <i class="fas fa-calendar-day"></i> Početak sezone
                    </button>
                </div>
                <button id="nextMonthBtn" class="btn-calendar-nav">
                    Sledeći <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            <div class="calendar-grid"></div>
        `;
        
        const calendarGrid = container.querySelector('.calendar-grid');
        
        ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'].forEach(day => {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-header';
            dayEl.textContent = day;
            calendarGrid.appendChild(dayEl);
        });
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        let firstDayOfWeek = firstDay.getDay();
        const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
        
        for (let i = 0; i < startOffset; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day empty';
            calendarGrid.appendChild(emptyDay);
        }
        
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(year, month, day);
            const dateStr = date.toISOString().split('T')[0];
            
            const seasonStart = new Date(season.period.start);
            const seasonEnd = new Date(season.period.end);
            
            seasonStart.setHours(0, 0, 0, 0);
            seasonEnd.setHours(0, 0, 0, 0);
            date.setHours(0, 0, 0, 0);
            
            if (date < seasonStart || date > seasonEnd) {
                const emptyDay = document.createElement('div');
                emptyDay.className = 'calendar-day out-of-season';
                emptyDay.innerHTML = `<div class="day-number">${day}</div><div class="day-data">van sezone</div>`;
                calendarGrid.appendChild(emptyDay);
                continue;
            }
            
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            dayDiv.setAttribute('data-date', dateStr);
            
            const dayData = season.days[dateStr] || { potrosnja: 0, temperatura: 0 };
            const potrosnja = parseFloat(dayData.potrosnja) || 0;
            const temperatura = parseFloat(dayData.temperatura) || 0;
            
            let tempDisplay = '—';
            if (temperatura !== 0) {
                tempDisplay = `${temperatura.toFixed(1)}°`;
            }
            
            let potrosnjaDisplay = '—';
            if (potrosnja > 0) {
                potrosnjaDisplay = `${potrosnja.toFixed(1)}`;
            }
            
            dayDiv.innerHTML = `
                <div class="day-number">${day}</div>
                <div class="day-data">
                    <div class="day-row">
                        <i class="fas fa-fire" style="color: #ff6b6b; width: 16px;"></i>
                        <span>${potrosnjaDisplay}</span>
                    </div>
                    <div class="day-row">
                        <i class="fas fa-thermometer-half" style="color: var(--primary-accent); width: 16px;"></i>
                        <span>${tempDisplay}</span>
                    </div>
                </div>
            `;
            
            dayDiv.addEventListener('click', () => {
                this.openDayEditor(dateStr, dayData);
            });
            
            calendarGrid.appendChild(dayDiv);
        }
        
        const prevBtn = document.getElementById('prevMonthBtn');
        const nextBtn = document.getElementById('nextMonthBtn');
        const currentBtn = document.getElementById('currentMonthBtn');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.changeMonth(-1));
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.changeMonth(1));
        }
        if (currentBtn) {
            currentBtn.addEventListener('click', () => this.goToSeasonStart());
        }
    }
    
    changeMonth(delta) {
        if (!this.currentMonthView) {
            this.currentMonthView = new Date();
        }
        
        this.currentMonthView.setMonth(this.currentMonthView.getMonth() + delta);
        
        const season = this.getActiveSeason();
        if (season) {
            this.seasonLastView[season.id] = this.currentMonthView.toISOString();
        }
        
        this.renderMonthlyCalendar();
    }
    
    goToSeasonStart() {
        const season = this.getActiveSeason();
        if (season && season.period && season.period.start) {
            this.currentMonthView = new Date(season.period.start);
            
            if (season) {
                this.seasonLastView[season.id] = this.currentMonthView.toISOString();
            }
        }
        
        this.renderMonthlyCalendar();
    }

    async dodajTemperatureZaSezonu() {
        const season = this.getActiveSeason();
        if (!season) {
            UIHelpers.showAlert('Izaberite sezonu', 'error');
            return;
        }
        
        const daysWithoutTemp = Object.values(season.days).filter(d => 
            d.temperatura === 0 || d.temperatura === null || d.temperatura === undefined
        ).length;
        
        if (daysWithoutTemp === 0) {
            UIHelpers.showAlert('Svi dani već imaju temperature!', 'info');
            return;
        }
        
        if (!confirm(`Dodati temperature za celu sezonu?\nPeriod: ${season.period.start} do ${season.period.end}\nBroj dana bez temperature: ${daysWithoutTemp}`)) {
            return;
        }
        
        UIHelpers.showLoading(true, 'Preuzimanje temperatura...');
        
        try {
            const azuriranaSezona = await temperatureService.updateSeasonTemperatures(season);
            
            dataManager.updateSeason(season.id, azuriranaSezona);
            
            this.renderRezime();
            this.renderKalendar();
            this.renderStatistika();
            this.renderChart();
            
            UIHelpers.showAlert(`Temperature uspešno ažurirane!`, 'success');
            
        } catch (error) {
            console.error('Greška pri ažuriranju temperatura:', error);
            UIHelpers.showAlert('Greška pri preuzimanju temperatura: ' + error.message, 'error');
        } finally {
            UIHelpers.showLoading(false);
        }
    }

    async updatePogresneTemperature() {
        const season = this.getActiveSeason();
        if (!season) {
            UIHelpers.showAlert('Izaberite sezonu', 'error');
            return;
        }
        
        const daniSaTemp = Object.values(season.days).filter(d => 
            d.temperatura !== 0 && d.temperatura !== null && d.temperatura !== undefined
        ).length;
        
        if (daniSaTemp === 0) {
            UIHelpers.showAlert('Nema upisanih temperatura za update', 'info');
            return;
        }
        
        if (!confirm(`Zameniti svih ${daniSaTemp} temperatura novim vrednostima sa interneta?\n\nOvo će PREBRISATI postojeće temperature!`)) {
            return;
        }
        
        UIHelpers.showLoading(true, 'Ažuriranje temperatura...');
        
        try {
            const stareTemperatures = {};
            Object.entries(season.days).forEach(([datum, podatak]) => {
                if (podatak.temperatura !== 0) {
                    stareTemperatures[datum] = podatak.temperatura;
                }
            });
            
            localStorage.setItem('temp_backup_' + season.id, JSON.stringify(stareTemperatures));
            
            Object.keys(season.days).forEach(datum => {
                season.days[datum].temperatura = 0;
            });
            
            const azuriranaSezona = await temperatureService.updateSeasonTemperatures(season);
            
            dataManager.updateSeason(season.id, azuriranaSezona);
            
            localStorage.removeItem('temp_backup_' + season.id);
            
            this.renderRezime();
            this.renderKalendar();
            this.renderStatistika();
            this.renderChart();
            
            UIHelpers.showAlert(`Uspešno zamenjeno ${daniSaTemp} temperatura!`, 'success');
            
        } catch (error) {
            console.error('Greška pri update-u temperatura:', error);
            
            const backup = localStorage.getItem('temp_backup_' + season.id);
            if (backup) {
                try {
                    const stare = JSON.parse(backup);
                    Object.entries(stare).forEach(([datum, temp]) => {
                        if (season.days[datum]) {
                            season.days[datum].temperatura = temp;
                        }
                    });
                    dataManager.saveData(this.state);
                    UIHelpers.showAlert('Vraćene stare temperature zbog greške', 'warning');
                } catch (e) {
                    console.error('Ne mogu vratiti backup:', e);
                }
            }
            
            UIHelpers.showAlert('Greška pri ažuriranju: ' + error.message, 'error');
        } finally {
            UIHelpers.showLoading(false);
        }
    }
    
    openDayEditor(dateStr, dayData = { potrosnja: 0, temperatura: 0 }) {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-labelledby', 'dayEditorTitle');
        modal.setAttribute('aria-modal', 'true');
        
        const formattedDate = UIHelpers.formatDate(dateStr);
        modal.innerHTML = `
            <div class="modal-content day-editor-modal">
                <div class="modal-header">
                    <h3 id="dayEditorTitle"><i class="fas fa-edit"></i> ${UIHelpers.escapeHTML(formattedDate)}</h3>
                    <button class="modal-close" aria-label="Zatvori">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="dayPotrosnja">Potrošnja (džakovi):</label>
                        <input type="number" id="dayPotrosnja" min="0" step="0.1" 
                               value="${dayData.potrosnja || 0}" 
                               class="form-input" aria-describedby="potrosnjaHelp">
                        <small id="potrosnjaHelp" class="form-help">1 džak = 15kg</small>
                    </div>
                    <div class="form-group">
                        <label for="dayTemperatura">Temperatura (°C):</label>
                        <div class="temperature-input-group">
                            <input type="number" id="dayTemperatura" step="0.1" 
                                   value="${dayData.temperatura || 0}" 
                                   class="form-input" aria-describedby="tempHelp">
                            <button id="fetchTempBtn" class="btn btn-sm" aria-label="Preuzmi temperaturu za ovaj dan">
                                <i class="fas fa-cloud-download-alt"></i> Preuzmi
                            </button>
                        </div>
                        <small id="tempHelp" class="form-help">Između -50 i 50°C</small>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="cancelDayBtn" class="btn btn-secondary">Otkaži</button>
                    <button id="saveDayBtn" class="btn btn-primary">Sačuvaj</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const firstInput = modal.querySelector('#dayPotrosnja');
        firstInput.focus();
        
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.remove();
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                modal.remove();
            }
        });
        
        modal.querySelector('#fetchTempBtn').addEventListener('click', async () => {
            const tempInput = modal.querySelector('#dayTemperatura');
            const fetchBtn = modal.querySelector('#fetchTempBtn');
            
            tempInput.disabled = true;
            fetchBtn.disabled = true;
            fetchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preuzimanje...';
            
            try {
                const temp = await temperatureService.getTemperatureForDate(dateStr);
                if (temp !== null) {
                    tempInput.value = temp;
                    UIHelpers.showAlert(`Temperatura: ${temp}°C`, 'success');
                } else {
                    UIHelpers.showAlert('Nije moguće dobiti temperaturu', 'error');
                }
            } catch (error) {
                UIHelpers.showAlert('Greška pri dobijanju temperature', 'error');
            } finally {
                tempInput.disabled = false;
                fetchBtn.disabled = false;
                fetchBtn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> Preuzmi';
            }
        });
        
        modal.querySelector('#cancelDayBtn').addEventListener('click', () => {
            modal.remove();
        });
        
        modal.querySelector('#saveDayBtn').addEventListener('click', () => {
            const potrosnja = parseFloat(modal.querySelector('#dayPotrosnja').value) || 0;
            const temperatura = parseFloat(modal.querySelector('#dayTemperatura').value) || 0;
            
            const errors = Validation.validateDayData({ potrosnja, temperatura });
            if (errors.length > 0) {
                UIHelpers.showAlert(errors.join('<br>'), 'error');
                return;
            }
            
            this.updateDan(dateStr, 'potrosnja', potrosnja);
            this.updateDan(dateStr, 'temperatura', temperatura);
            
            modal.remove();
            UIHelpers.showAlert('Podaci sačuvani', 'success');
        });
    }

    updateDan(datum, field, value) {
        const season = this.getActiveSeason();
        if (!season) return;
        
        if (!season.days[datum]) {
            season.days[datum] = {
                potrosnja: 0,
                temperatura: 0,
                createdAt: new Date().toISOString()
            };
        }
        
        season.days[datum][field] = value;
        season.days[datum].updatedAt = new Date().toISOString();
        season.meta.updatedAt = new Date().toISOString();
        
        dataManager.saveData(this.state);
        
        this.debounce(() => {
            this.renderRezime();
            this.renderStatistika();
            this.renderChart();
            this.renderMonthlyCalendar();
        }, 300)();
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ========== IZMENJENA METODA ZA PRIKAZ REZIMEA ==========
    async renderRezime() {
        const container = document.getElementById('rezimeSezone');
        const season = this.getActiveSeason();
        
        if (!season) {
            container.innerHTML = '<div class="info-message"><i class="fas fa-chart-line"></i><p>Izaberite sezonu</p></div>';
            return;
        }
        
        const daysArray = Object.values(season.days);
        const ukupnaPotrosnja = daysArray.reduce((sum, dan) => sum + (dan.potrosnja || 0), 0);
        const ukupnaPotrosnjaKg = UIHelpers.dzakToKg(ukupnaPotrosnja);
        const brojDana = daysArray.length;
        const prosecnaDnevna = brojDana > 0 ? ukupnaPotrosnja / brojDana : 0;
        const daniSaPotrosnjom = daysArray.filter(d => d.potrosnja > 0).length;
        const daniSaTemperaturom = daysArray.filter(d => d.temperatura !== 0).length;
        const prosecnaTemp = daniSaTemperaturom > 0 ? 
            daysArray.reduce((sum, dan) => sum + (dan.temperatura || 0), 0) / daniSaTemperaturom : 0;
        
        const kupljeno = season.zalihe?.kupljeno || 0;
        const preneto = season.zalihe?.preneto || 0;
        const ukupno = kupljeno + preneto;
        const preostalo = ukupno - ukupnaPotrosnja;
        
        // Izračunaj vrednost ako ima cena
        let vrednostText = '';
        if (season.zalihe?.cena) {
            const cena = season.zalihe.cena;
            const ukupnoTona = ukupno * DZAK_KG / 1000;
            const ukupnoPaleta = ukupno / PALETA_DZAKOVA;
            
            let vrednost = 0;
            if (cena.poTon > 0) {
                vrednost = ukupnoTona * cena.poTon;
                vrednostText = `Vrednost: ${UIHelpers.formatCena(vrednost, cena.valuta)}`;
            } else if (cena.poPaleti > 0) {
                vrednost = ukupnoPaleta * cena.poPaleti;
                vrednostText = `Vrednost: ${UIHelpers.formatCena(vrednost, cena.valuta)}`;
            }
        }
        
        const pocetak = new Date(season.period.start);
        const kraj = new Date(season.period.end);
        pocetak.setHours(0, 0, 0, 0);
        kraj.setHours(0, 0, 0, 0);
        
        const ukupnoDanaSezone = Math.floor((kraj - pocetak) / (1000 * 60 * 60 * 24)) + 1;
        const preostaloDana = Math.max(0, ukupnoDanaSezone - brojDana);
        const potrosnjaDoKraja = preostaloDana * prosecnaDnevna;
        const prognozaZaliha = preostalo - potrosnjaDoKraja;
        
        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-value">${UIHelpers.formatBroj(ukupnaPotrosnja)}</div>
                    <div class="stat-label">Potrošeno</div>
                    <div class="stat-sub">${UIHelpers.formatBroj(ukupnaPotrosnjaKg)} kg</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${UIHelpers.formatBroj(prosecnaDnevna, 2)}</div>
                    <div class="stat-label">Dnevno</div>
                    <div class="stat-sub">${daniSaPotrosnjom} dana sipanja</div>
                </div>
                <div class="stat-item" style="cursor: pointer;" onclick="window.peletTracker?.prikaziIzmenuKolicine()" title="Kliknite za izmenu">
                    <div class="stat-value">${UIHelpers.formatBroj(preostalo)}</div>
                    <div class="stat-label">Preostalo</div>
                    <div class="stat-sub">${prognozaZaliha >= 0 ? '✅ OK' : '❌ MALO'} <i class="fas fa-pencil-alt" style="font-size: 0.8rem;"></i></div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${UIHelpers.formatBroj(prosecnaTemp, 1)}</div>
                    <div class="stat-label">Prosečna temp</div>
                    <div class="stat-sub">${daniSaTemperaturom}/${brojDana} dana</div>
                </div>
            </div>
            
            <div class="info-banner" style="margin-top: 10px; background: rgba(0,210,255,0.1);">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; flex-wrap: wrap; gap: 10px;">
                    <span><i class="fas fa-shopping-cart"></i> Kupljeno: ${UIHelpers.formatBroj(kupljeno)} dž</span>
                    <span><i class="fas fa-exchange-alt"></i> Preneto: ${UIHelpers.formatBroj(preneto)} dž</span>
                    <span><i class="fas fa-boxes"></i> Ukupno: ${UIHelpers.formatBroj(ukupno)} dž</span>
                </div>
                ${vrednostText ? `<div style="margin-top: 8px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;"><i class="fas fa-tag"></i> ${vrednostText}</div>` : ''}
            </div>
            
            <div class="info-banner" style="margin-top: 10px; background: rgba(255,255,255,0.05);">
                <i class="fas fa-info-circle"></i>
                <span>Sezona traje ${ukupnoDanaSezone} dana (od ${season.period.start} do ${season.period.end})</span>
            </div>
            
            ${prognozaZaliha < 0 ? `
                <div class="warning-banner">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>UPOZORENJE:</strong> Nedostaje ${UIHelpers.formatBroj(Math.abs(prognozaZaliha))} džakova!
                </div>
            ` : ''}
            
            ${daniSaTemperaturom < brojDana * 0.3 ? `
                <div class="info-banner">
                    <i class="fas fa-info-circle"></i>
                    <strong>INFO:</strong> Samo ${daniSaTemperaturom} od ${brojDana} dana ima temperature. 
                    <button id="fillMissingTempsBtn" class="btn-link">Dodaj temperature</button>
                </div>
            ` : ''}
        `;
        
        const fillBtn = container.querySelector('#fillMissingTempsBtn');
        if (fillBtn) {
            this.addListenerToElement(fillBtn, 'click', () => this.dodajTemperatureZaSezonu());
        }
    }

    renderStatistika() {
        const container = document.getElementById('statistikaContainer');
        const season = this.getActiveSeason();
        
        if (!season) {
            container.innerHTML = '<div class="info-message"><i class="fas fa-chart-bar"></i><p>Nema podataka</p></div>';
            return;
        }
        
        const meseci = {};
        Object.entries(season.days).forEach(([dateStr, dan]) => {
            const date = new Date(dateStr);
            const monthKey = date.toLocaleDateString('sr-RS', { month: 'long', year: 'numeric' });
            
            if (!meseci[monthKey]) {
                meseci[monthKey] = {
                    potrosnja: 0,
                    temp: 0,
                    dani: 0,
                    potrosnjaKg: 0,
                    daniSaPotrosnjom: 0,
                    daniSaTemperaturom: 0
                };
            }
            
            meseci[monthKey].potrosnja += (dan.potrosnja || 0);
            meseci[monthKey].potrosnjaKg += UIHelpers.dzakToKg(dan.potrosnja || 0);
            meseci[monthKey].temp += (dan.temperatura || 0);
            meseci[monthKey].dani += 1;
            
            if (dan.potrosnja > 0) meseci[monthKey].daniSaPotrosnjom++;
            if (dan.temperatura !== 0) meseci[monthKey].daniSaTemperaturom++;
        });
        
        let html = `
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Mesec</th>
                            <th>Dana</th>
                            <th>Sa potrošnjom</th>
                            <th>Potrošnja (dž)</th>
                            <th>Potrošnja (kg)</th>
                            <th>Prosečno/danu</th>
                            <th>Temp (°C)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        for (const [month, data] of Object.entries(meseci)) {
            const prosecnaDnevna = data.dani > 0 ? data.potrosnja / data.dani : 0;
            const prosecnaTemp = data.daniSaTemperaturom > 0 ? data.temp / data.daniSaTemperaturom : 0;
            
            html += `
                <tr>
                    <td><strong>${UIHelpers.escapeHTML(month)}</strong></td>
                    <td>${data.dani}</td>
                    <td>${data.daniSaPotrosnjom}</td>
                    <td>${UIHelpers.formatBroj(data.potrosnja, 1)}</td>
                    <td>${UIHelpers.formatBroj(data.potrosnjaKg, 0)}</td>
                    <td>${UIHelpers.formatBroj(prosecnaDnevna, 2)}</td>
                    <td>${UIHelpers.formatBroj(prosecnaTemp, 1)}</td>
                </tr>
            `;
        }
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        container.innerHTML = html;
    }

    renderChart() {
        const canvas = document.getElementById('potrosnjaChart');
        const season = this.getActiveSeason();
        
        if (!canvas || !season) {
            if (this.chart) {
                this.chart.destroy();
                this.chart = null;
            }
            return;
        }
        
        const ctx = canvas.getContext('2d');
        
        const daysArray = Object.entries(season.days)
            .map(([date, data]) => ({ date, ...data }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        const daysWithConsumption = daysArray.filter(d => d.potrosnja > 0);
        const groupSize = Math.max(1, Math.ceil(daysWithConsumption.length / 15));
        
        const labels = [];
        const potrosnjaData = [];
        const tempData = [];
        
        for (let i = 0; i < daysWithConsumption.length; i += groupSize) {
            const group = daysWithConsumption.slice(i, i + groupSize);
            if (group.length > 0) {
                const firstDate = new Date(group[0].date);
                
                let label;
                if (groupSize === 1) {
                    label = firstDate.toLocaleDateString('sr-RS', { day: '2-digit', month: 'short' });
                } else {
                    label = `${firstDate.toLocaleDateString('sr-RS', { day: '2-digit', month: 'short' })}...`;
                }
                
                labels.push(label);
                
                const avgPotrosnja = group.reduce((sum, d) => sum + d.potrosnja, 0) / group.length;
                potrosnjaData.push(avgPotrosnja);
                
                const daysWithTemp = group.filter(d => d.temperatura !== 0);
                const avgTemp = daysWithTemp.length > 0 ? 
                    daysWithTemp.reduce((sum, d) => sum + d.temperatura, 0) / daysWithTemp.length : 0;
                tempData.push(avgTemp);
            }
        }
        
        if (this.chart) {
            this.chart.destroy();
        }
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Potrošnja (dž)',
                        data: potrosnjaData,
                        borderColor: '#00d2ff',
                        backgroundColor: 'rgba(0, 210, 255, 0.1)',
                        borderWidth: 3,
                        yAxisID: 'y',
                        fill: true,
                        tension: 0.2,
                        pointRadius: 3,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Temperatura (°C)',
                        data: tempData,
                        borderColor: '#ff6b6b',
                        backgroundColor: 'rgba(255, 107, 107, 0.1)',
                        borderWidth: 3,
                        yAxisID: 'y1',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 3,
                        pointHoverRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        labels: {
                            color: 'rgba(255, 255, 255, 0.9)'
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: 'rgba(255, 255, 255, 0.9)',
                        bodyColor: 'rgba(255, 255, 255, 0.8)',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += UIHelpers.formatBroj(context.parsed.y, 
                                        context.datasetIndex === 0 ? 2 : 1);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Džakovi',
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: '°C',
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            drawOnChartArea: false,
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    },
                    x: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            maxRotation: 45,
                            minRotation: 45
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }

    // ========== IZMENJENA METODA ZA POREĐENJE SEZONA ==========
    renderPoredenje() {
        const container = document.getElementById('poredenjeContainer');
        const seasons = Object.values(this.state.seasons);
        
        if (seasons.length === 0) {
            container.innerHTML = '<div class="info-message"><i class="fas fa-balance-scale"></i><p>Nema sezona za poređenje</p></div>';
            return;
        }
        
        let html = `
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Sezona</th>
                            <th>Period</th>
                            <th>Dana</th>
                            <th>Kupljeno</th>
                            <th>Preneto</th>
                            <th>Ukupno</th>
                            <th>Potrošnja</th>
                            <th>Preostalo</th>
                            <th>Dnevno</th>
                            <th>Temp</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        seasons.sort((a, b) => new Date(b.period.start) - new Date(a.period.start));
        
        seasons.forEach(season => {
            const daysArray = Object.values(season.days);
            const ukupnaPotrosnja = daysArray.reduce((sum, dan) => sum + (dan.potrosnja || 0), 0);
            const kupljeno = season.zalihe?.kupljeno || 0;
            const preneto = season.zalihe?.preneto || 0;
            const ukupno = kupljeno + preneto;
            const preostalo = ukupno - ukupnaPotrosnja;
            const brojDana = daysArray.length;
            const prosecnaDnevna = brojDana > 0 ? ukupnaPotrosnja / brojDana : 0;
            
            const daniSaTemperaturom = daysArray.filter(d => d.temperatura !== 0).length;
            const prosecnaTemp = daniSaTemperaturom > 0 ? 
                daysArray.reduce((sum, dan) => sum + (dan.temperatura || 0), 0) / daniSaTemperaturom : 0;
            
            const pocetak = new Date(season.period.start);
            const kraj = new Date(season.period.end);
            const period = `${pocetak.toLocaleDateString('sr-RS', { month: 'short', year: 'numeric' })} - ${kraj.toLocaleDateString('sr-RS', { month: 'short', year: 'numeric' })}`;
            
            const isActive = this.state.activeSeasonId === season.id;
            
            html += `
                <tr ${isActive ? 'class="active-season"' : ''}>
                    <td><strong>${UIHelpers.escapeHTML(season.naziv || season.id)}</strong>${isActive ? ' <i class="fas fa-star" style="color: #00d2ff;"></i>' : ''}</td>
                    <td>${UIHelpers.escapeHTML(period)}</td>
                    <td>${brojDana}</td>
                    <td>${UIHelpers.formatBroj(kupljeno, 1)}</td>
                    <td>${UIHelpers.formatBroj(preneto, 1)}</td>
                    <td>${UIHelpers.formatBroj(ukupno, 1)}</td>
                    <td>${UIHelpers.formatBroj(ukupnaPotrosnja, 1)}</td>
                    <td>${UIHelpers.formatBroj(preostalo, 1)}</td>
                    <td>${UIHelpers.formatBroj(prosecnaDnevna, 2)}</td>
                    <td>${UIHelpers.formatBroj(prosecnaTemp, 1)}</td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        container.innerHTML = html;
    }

    showBulkEdit() {
        const season = this.getActiveSeason();
        if (!season) {
            UIHelpers.showAlert('Izaberite sezonu prvo', 'error');
            return;
        }
        
        const startDate = season.period.start;
        const endDate = season.period.end;
        
        document.getElementById('bulkStartDate').value = startDate;
        document.getElementById('bulkEndDate').value = endDate;
        document.getElementById('bulkPotrosnja').value = '0';
        document.getElementById('bulkTemperatura').value = '5';
        
        UIHelpers.showModal('bulkEditModal');
        
        setTimeout(() => {
            document.getElementById('bulkStartDate').focus();
        }, 100);
    }

    applyBulkEdit() {
        const season = this.getActiveSeason();
        if (!season) return;
        
        const startDate = document.getElementById('bulkStartDate').value;
        const endDate = document.getElementById('bulkEndDate').value;
        const potrosnja = parseFloat(document.getElementById('bulkPotrosnja').value) || 0;
        const temperatura = parseFloat(document.getElementById('bulkTemperatura').value) || 0;
        
        if (!startDate || !endDate) {
            UIHelpers.showAlert('Unesite period', 'error');
            return;
        }
        
        const errors = Validation.validateDayData({ potrosnja, temperatura });
        if (errors.length > 0) {
            UIHelpers.showAlert(errors.join('<br>'), 'error');
            return;
        }
        
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (end < start) {
            UIHelpers.showAlert('Kraj mora biti posle početka', 'error');
            return;
        }
        
        let updatedCount = 0;
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            
            const seasonStart = new Date(season.period.start);
            const seasonEnd = new Date(season.period.end);
            
            if (d >= seasonStart && d <= seasonEnd) {
                if (!season.days[dateStr]) {
                    season.days[dateStr] = {
                        potrosnja: 0,
                        temperatura: 0,
                        createdAt: new Date().toISOString()
                    };
                }
                
                season.days[dateStr].potrosnja = potrosnja;
                season.days[dateStr].temperatura = temperatura;
                season.days[dateStr].updatedAt = new Date().toISOString();
                updatedCount++;
            }
        }
        
        season.meta.updatedAt = new Date().toISOString();
        dataManager.saveData(this.state);
        
        this.debounce(() => {
            this.renderKalendar();
            this.renderRezime();
            this.renderStatistika();
            this.renderChart();
        }, 300)();
        
        UIHelpers.hideModal('bulkEditModal');
        UIHelpers.showAlert(`Ažurirano ${updatedCount} dana`, 'success');
    }

    async autoFillTemperatures() {
        await this.dodajTemperatureZaSezonu();
    }

    exportJSON() {
        try {
            const backupData = {
                version: '4.0',
                exportedAt: new Date().toISOString(),
                data: this.state
            };
            
            const dataStr = JSON.stringify(backupData, null, 2);
            
            const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pelet_backup_${new Date().toISOString().split('T')[0]}.json`;
            a.setAttribute('aria-label', 'Preuzmi backup podataka');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            UIHelpers.showAlert('Backup preuzet!', 'success');
        } catch (error) {
            console.error('Error exporting:', error);
            UIHelpers.showAlert('Greška pri izvozu: ' + error.message, 'error');
        }
    }

    importJSON() {
        const fileInput = document.getElementById('jsonFile');
        
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            UIHelpers.showAlert('Izaberite fajl', 'error');
            return;
        }
        
        const file = fileInput.files[0];
        
        if (!file.name.toLowerCase().endsWith('.json')) {
            UIHelpers.showAlert('Fajl mora biti JSON', 'error');
            fileInput.value = '';
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            UIHelpers.showAlert('Fajl je prevelik (max 5MB)', 'error');
            fileInput.value = '';
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = (e) => {
            UIHelpers.showLoading(true, 'Uvoz podataka...');
            
            try {
                const jsonText = e.target.result;
                
                if (!jsonText || jsonText.trim() === '') {
                    UIHelpers.showLoading(false);
                    throw new Error('Fajl je prazan');
                }
                
                const importedState = dataManager.importData(jsonText);
                
                if (!importedState || !importedState.seasons) {
                    UIHelpers.showLoading(false);
                    throw new Error('Nema sezona za uvoz');
                }
                
                let summary = `Pronađeno ${Object.keys(importedState.seasons).length} sezona:\n\n`;
                Object.values(importedState.seasons).forEach((season, i) => {
                    const kupljeno = season.zalihe?.kupljeno || 0;
                    const preneto = season.zalihe?.preneto || 0;
                    summary += `${i+1}. ${season.id} (kupljeno: ${kupljeno}, preneto: ${preneto})\n`;
                });
                
                summary += `\nDodati sezone?`;
                
                if (!confirm(summary)) {
                    UIHelpers.showLoading(false);
                    UIHelpers.showAlert('Uvoz otkazan', 'info');
                    fileInput.value = '';
                    return;
                }
                
                let addedCount = 0;
                let replacedCount = 0;
                
                Object.entries(importedState.seasons).forEach(([seasonId, newSeason]) => {
                    if (this.state.seasons[seasonId]) {
                        this.state.seasons[seasonId] = newSeason;
                        replacedCount++;
                    } else {
                        this.state.seasons[seasonId] = newSeason;
                        addedCount++;
                    }
                });
                
                dataManager.saveData(this.state);
                this.osveziSezonaSelect();
                fileInput.value = '';
                
                let resultMsg = '';
                if (addedCount > 0) resultMsg += `Dodato ${addedCount} novih. `;
                if (replacedCount > 0) resultMsg += `Zamenjeno ${replacedCount} postojećih. `;
                
                UIHelpers.showAlert(resultMsg || 'Uvoz uspešan!', 'success');
                
                if (addedCount === 1 && replacedCount === 0) {
                    const addedSeason = Object.values(importedState.seasons)[0];
                    this.state.activeSeasonId = addedSeason.id;
                    document.getElementById('sezonaSelect').value = addedSeason.id;
                    this.ucitajSezonu();
                }
                
            } catch (error) {
                console.error('Greška pri uvozu:', error);
                UIHelpers.showAlert('Greška pri uvozu: ' + error.message, 'error');
                fileInput.value = '';
            } finally {
                UIHelpers.showLoading(false);
            }
        };
        
        reader.onerror = () => {
            UIHelpers.showLoading(false);
            UIHelpers.showAlert('Greška pri čitanju fajla', 'error');
            fileInput.value = '';
        };
        
        reader.readAsText(file);
    }

    importConvertedData() {
        try {
            const convertedDataStr = localStorage.getItem('pelet_converted_data');
            if (!convertedDataStr) {
                UIHelpers.showAlert('Nema konvertovanih podataka', 'info');
                return;
            }
            
            const convertedData = JSON.parse(convertedDataStr);
            
            if (!convertedData.data || !Array.isArray(convertedData.data)) {
                throw new Error('Nevalidni podaci');
            }
            
            const seasons = convertedData.data;
            
            if (seasons.length === 0) {
                UIHelpers.showAlert('Podaci su prazni', 'info');
                return;
            }
            
            let summary = `Pronađeno ${seasons.length} sezona:\n\n`;
            seasons.forEach((season, i) => {
                const daysWithData = Object.values(season.days || {}).filter(d => d.potrosnja > 0).length;
                summary += `${i+1}. ${season.id} (${daysWithData}/${Object.keys(season.days || {}).length} dana sa potrošnjom)\n`;
            });
            
            summary += `\nUvesti sezone?\n(Ako sezona već postoji, biće zamenjena)`;
            
            if (!confirm(summary)) {
                UIHelpers.showAlert('Uvoz otkazan', 'info');
                return;
            }
            
            let added = 0;
            let replaced = 0;
            
            seasons.forEach(newSeason => {
                // Osiguraj da ima zalihe strukturu
                if (!newSeason.zalihe) {
                    newSeason.zalihe = {
                        kupljeno: newSeason.pocetnaKolicina || 0,
                        preneto: 0,
                        cena: { poTon: 0, poPaleti: 0, valuta: 'RSD' }
                    };
                }
                
                if (this.state.seasons[newSeason.id]) {
                    this.state.seasons[newSeason.id] = newSeason;
                    replaced++;
                } else {
                    this.state.seasons[newSeason.id] = newSeason;
                    added++;
                }
            });
            
            dataManager.saveData(this.state);
            localStorage.removeItem('pelet_converted_data');
            this.osveziSezonaSelect();
            
            let msg = '';
            if (added > 0) msg += `Dodato ${added} novih. `;
            if (replaced > 0) msg += `Zamenjeno ${replaced} postojećih. `;
            
            UIHelpers.showAlert(msg || 'Uvoz uspešan!', 'success');
            
            if (added === 1 && replaced === 0) {
                const addedSeason = seasons[0];
                this.state.activeSeasonId = addedSeason.id;
                document.getElementById('sezonaSelect').value = addedSeason.id;
                this.ucitajSezonu();
            }
            
        } catch (error) {
            console.error('Greška:', error);
            UIHelpers.showAlert('Greška: ' + error.message, 'error');
        }
    }

    showBackups() {
        const backups = JSON.parse(localStorage.getItem('pelet_backups') || '[]');
        const container = document.getElementById('backupsList');
        
        if (!container) return;
        
        if (backups.length === 0) {
            container.innerHTML = '<p class="info-text">Nema backup-a</p>';
        } else {
            let html = '<div class="backup-list">';
            backups.forEach((backup, index) => {
                const date = new Date(backup.timestamp);
                const seasonCount = backup.data ? Object.keys(backup.data.seasons || {}).length : 0;
                
                html += `
                    <div class="backup-item" style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 1rem; margin-bottom: 0.8rem;">
                        <div class="backup-header" style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <strong>Backup ${index + 1}</strong>
                            <span class="backup-date" style="color: var(--text-muted);">${date.toLocaleString('sr-RS')}</span>
                        </div>
                        <div class="backup-info" style="display: flex; gap: 1rem; margin-bottom: 0.8rem;">
                            <span class="backup-reason">${backup.reason || 'Manuelni'}</span>
                            <span class="backup-count">${seasonCount} sezona</span>
                        </div>
                        <button class="btn btn-sm restore-backup-btn" data-index="${index}" style="width: 100%;">
                            <i class="fas fa-redo"></i> Vrati
                        </button>
                    </div>
                `;
            });
            html += '</div>';
            container.innerHTML = html;
            
            container.querySelectorAll('.restore-backup-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const index = parseInt(e.target.closest('button').dataset.index);
                    this.restoreBackup(backups[index]);
                });
            });
        }
        
        UIHelpers.showModal('backupsModal');
    }

    restoreBackup(backup) {
        if (!confirm('Vratiti podatke iz ovog backup-a?\nTrenutni podaci će biti zamenjeni.')) {
            return;
        }
        
        this.state = backup.data || { version: '4.0', activeSeasonId: null, seasons: {} };
        dataManager.saveData(this.state);
        
        this.osveziSezonaSelect();
        this.ucitajSezonu();
        
        UIHelpers.hideModal('backupsModal');
        UIHelpers.showAlert('Podaci vraćeni iz backup-a!', 'success');
    }

    obrisiSezonu() {
        const season = this.getActiveSeason();
        if (!season) {
            UIHelpers.showAlert('Izaberite sezonu', 'error');
            return;
        }
        
        const seasonName = season.id;
        
        if (!confirm(`Obrisati sezonu "${seasonName}"?\nOva akcija se ne može poništiti!`)) {
            return;
        }
        
        const backup = {
            ...season,
            deletedAt: new Date().toISOString()
        };
        
        const deletedHistory = JSON.parse(localStorage.getItem('pelet_deleted_history') || '[]');
        deletedHistory.unshift(backup);
        if (deletedHistory.length > 3) deletedHistory.pop();
        localStorage.setItem('pelet_deleted_history', JSON.stringify(deletedHistory));
        
        delete this.state.seasons[seasonName];
        
        if (this.state.activeSeasonId === seasonName) {
            const remainingSeasons = Object.keys(this.state.seasons);
            this.state.activeSeasonId = remainingSeasons.length > 0 ? remainingSeasons[0] : null;
        }
        
        dataManager.saveData(this.state);
        
        this.osveziSezonaSelect();
        this.renderRezime();
        this.renderKalendar();
        this.renderStatistika();
        this.renderPoredenje();
        this.renderChart();
        
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
        
        UIHelpers.showAlert(`Sezona "${seasonName}" obrisana`, 'success');
    }

    undoDelete() {
        const deletedHistory = JSON.parse(localStorage.getItem('pelet_deleted_history') || '[]');
        if (deletedHistory.length === 0) {
            UIHelpers.showAlert('Nema sezona za povratak', 'info');
            return;
        }
        
        const lastDeleted = deletedHistory.shift();
        
        if (this.state.seasons[lastDeleted.id]) {
            UIHelpers.showAlert('Sezona već postoji', 'error');
            localStorage.setItem('pelet_deleted_history', JSON.stringify(deletedHistory));
            return;
        }
        
        this.state.seasons[lastDeleted.id] = lastDeleted;
        dataManager.saveData(this.state);
        localStorage.setItem('pelet_deleted_history', JSON.stringify(deletedHistory));
        
        this.osveziSezonaSelect();
        UIHelpers.showAlert(`Sezona "${lastDeleted.id}" vraćena`, 'success');
    }

    resetSve() {
        if (!confirm('OBRISATI SVE PODATKE?\nNe može se poništiti!')) {
            return;
        }
        
        if (!confirm('ZAISTA obrisati SVE?\nNapraviće se backup pre brisanja.')) {
            return;
        }
        
        this.exportJSON();
        
        setTimeout(() => {
            this.state = {
                version: '4.0',
                activeSeasonId: null,
                seasons: {}
            };
            
            this.currentMonthView = new Date();
            this.seasonLastView = {};
            
            dataManager.saveData(this.state);
            
            localStorage.removeItem('pelet_last_active');
            localStorage.removeItem('pelet_converted_data');
            localStorage.removeItem('pelet_deleted_history');
            localStorage.removeItem('pelet_backups');
            temperatureService.clearCache();
            
            this.cleanupEventListeners();
            
            this.osveziSezonaSelect();
            document.getElementById('rezimeSezone').innerHTML = '<div class="info-message"><i class="fas fa-chart-line"></i><p>Izaberite sezonu</p></div>';
            document.getElementById('kalendarContainer').innerHTML = '<div class="info-message"><i class="fas fa-calendar"></i><p>Izaberite sezonu</p></div>';
            document.getElementById('statistikaContainer').innerHTML = '<div class="info-message"><i class="fas fa-chart-bar"></i><p>Nema podataka</p></div>';
            document.getElementById('poredenjeContainer').innerHTML = '<div class="info-message"><i class="fas fa-balance-scale"></i><p>Nema sezona</p></div>';
            
            if (this.chart) {
                this.chart.destroy();
                this.chart = null;
            }
            
            this.addSampleData();
            UIHelpers.showAlert('Svi podaci obrisani. Backup je preuzet.', 'success');
        }, 1000);
    }

    destroy() {
        this.cleanupEventListeners();
        if (this.chart) {
            this.chart.destroy();
        }
    }
}

// Inicijalizacija
document.addEventListener('DOMContentLoaded', () => {
    window.peletTracker = new PeletTracker();
});

window.addEventListener('beforeunload', () => {
    if (window.peletTracker) {
        window.peletTracker.destroy();
    }
});