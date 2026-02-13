// Glavna aplikacija Pelet Tracker - REFAKTORISANO SA NOVOM STRUKTUROM
// KOMPLETNA VERZIJA SA PWA PODRŠKOM

class PeletTracker {
    constructor() {
        this.state = dataManager.loadData();
        this.chart = null;
        this.currentMonthView = new Date();
        this.eventListeners = new Map();
        this.seasonLastView = {};
        
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

    getAndroidBridge() {
        return {
            getSeasons: () => Object.keys(this.state.seasons),
            getActiveSeason: () => this.state.activeSeasonId,
            getStats: () => {
                const season = this.getActiveSeason();
                if (!season) return null;
                
                const daysArray = Object.values(season.days);
                return {
                    ukupnaPotrosnja: daysArray.reduce((sum, dan) => sum + (dan.potrosnja || 0), 0),
                    prosecnaDnevna: daysArray.length > 0 ? 
                        daysArray.reduce((sum, dan) => sum + (dan.potrosnja || 0), 0) / daysArray.length : 0,
                    preostalo: season.pocetnaKolicina - daysArray.reduce((sum, dan) => sum + (dan.potrosnja || 0), 0)
                };
            },
            exportData: () => this.exportJSON(),
            importData: (jsonString) => {
                try {
                    const imported = JSON.parse(jsonString);
                    return { success: true };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }
        };
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
            pocetnaKolicina: 100,
            days: {},
            meta: {
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        };
        
        for (let i = 0; i < 30; i++) {
            const date = new Date(currentYear-1, 9, 1 + i);
            const dateStr = date.toISOString().split('T')[0];
            
            sampleSeason.days[dateStr] = {
                potrosnja: i % 5 === 0 ? parseFloat((Math.random() * 3).toFixed(2)) : 0,
                temperatura: i % 5 === 0 ? parseFloat((Math.random() * 20).toFixed(1)) : 0,
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

    async dodajSezonu() {
        const seasonData = {
            id: UIHelpers.sanitizeHTML(document.getElementById('novaSezonaID').value.trim()),
            pocetniDatum: document.getElementById('pocetakGrejanja').value,
            krajDatum: document.getElementById('krajGrejanja').value,
            pocetnaKolicina: parseFloat(document.getElementById('pocetnaKolicina').value) || 0
        };
        
        const existingSeasons = Object.values(this.state.seasons);
        const errors = Validation.validateSeasonData(seasonData, existingSeasons);
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
        
        const novaSezona = {
            id: seasonData.id,
            naziv: seasonData.id,
            period: {
                start: seasonData.pocetniDatum,
                end: seasonData.krajDatum
            },
            pocetnaKolicina: seasonData.pocetnaKolicina,
            days: {},
            meta: {
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        };
        
        this.state.seasons[seasonData.id] = novaSezona;
        this.state.activeSeasonId = seasonData.id;
        dataManager.saveData(this.state);
        
        this.osveziSezonaSelect();
        document.getElementById('sezonaSelect').value = seasonData.id;
        this.ucitajSezonu();
        
        document.getElementById('novaSezonaID').value = '';
        UIHelpers.showAlert(`Sezona "${seasonData.id}" je uspešno kreirana!`, 'success');
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
        
        this.state.activeSeasonId = seasonId;
        dataManager.saveData(this.state);
        
        if (!this.state.seasons[seasonId]) {
            UIHelpers.showAlert('Sezona nije pronađena', 'error');
            return;
        }
        
        const season = this.state.seasons[seasonId];
        if (season && season.period && season.period.start) {
            this.currentMonthView = new Date(season.period.start);
        }
        
        UIHelpers.showLoading();
        
        try {
            await Promise.all([
                this.renderRezime(),
                this.renderKalendar(),
                this.renderStatistika(),
                this.renderPoredenje(),
                this.renderChart()
            ]);
        } catch (error) {
            console.error('Error loading season:', error);
            UIHelpers.showAlert('Greška pri učitavanju sezone', 'error');
        } finally {
            UIHelpers.hideLoading();
        }
    }

    async renderKalendar() {
        const container = document.getElementById('kalendarContainer');
        const season = this.getActiveSeason();
        
        if (!season) {
            container.innerHTML = '<div class="info-message"><i class="fas fa-calendar"></i><p>Izaberite sezonu za prikaz kalendara</p></div>';
            return;
        }
        
        if (Object.keys(season.days).length === 0) {
            this.initializeSeasonDays();
        }
        
        this.renderMonthlyCalendar();
    }
    
    initializeSeasonDays() {
        const season = this.getActiveSeason();
        if (!season) return;
        
        const start = new Date(season.period.start);
        const end = new Date(season.period.end);
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            
            if (!season.days[dateStr]) {
                season.days[dateStr] = {
                    potrosnja: 0,
                    temperatura: 0,
                    createdAt: new Date().toISOString()
                };
            }
        }
        
        season.meta.updatedAt = new Date().toISOString();
        dataManager.saveData(this.state);
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
        const firstDayOfWeek = firstDay.getDay();
        const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
        
        for (let i = 0; i < startOffset; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day empty';
            calendarGrid.appendChild(emptyDay);
        }
        
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(year, month, day);
            const dateStr = date.toISOString().split('T')[0];
            
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            dayDiv.setAttribute('data-date', dateStr);
            
            const dayData = season.days[dateStr];
            const potrosnja = dayData ? (parseFloat(dayData.potrosnja) || 0) : 0;
            const temperatura = dayData ? (parseFloat(dayData.temperatura) || 0) : 0;
            
            let tempDisplay = '—';
            if (temperatura !== 0 && temperatura !== null && temperatura !== undefined) {
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
                        <i class="fas fa-fire" style="color: #e74c3c; width: 16px;"></i>
                        <span>${potrosnjaDisplay}</span>
                    </div>
                    <div class="day-row">
                        <i class="fas fa-thermometer-half" style="color: #3498db; width: 16px;"></i>
                        <span>${tempDisplay}</span>
                    </div>
                </div>
            `;
            
            dayDiv.addEventListener('click', () => {
                this.openDayEditor(dateStr, dayData);
            });
            
            calendarGrid.appendChild(dayDiv);
        }
        
        this.addEventListener('prevMonthBtn', 'click', () => this.changeMonth(-1));
        this.addEventListener('nextMonthBtn', 'click', () => this.changeMonth(1));
        this.addEventListener('currentMonthBtn', 'click', () => this.goToSeasonStart());
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
        
        const seasonStart = season.period.start;
        const seasonEnd = season.period.end;
        
        if (!confirm(`Dodati temperature za celu sezonu?\n(${seasonStart} - ${seasonEnd})`)) {
            return;
        }
        
        UIHelpers.showLoading();
        
        try {
            const temps = await temperatureService.getTemperaturesForSeason(seasonStart, seasonEnd);
            
            let dodato = 0;
            Object.keys(season.days).forEach(dateStr => {
                if (temps[dateStr] !== undefined) {
                    season.days[dateStr].temperatura = temps[dateStr];
                    season.days[dateStr].updatedAt = new Date().toISOString();
                    dodato++;
                }
            });
            
            season.meta.updatedAt = new Date().toISOString();
            dataManager.saveData(this.state);
            
            this.renderKalendar();
            this.renderRezime();
            this.renderStatistika();
            this.renderChart();
            
            UIHelpers.showAlert(`Dodato ${dodato} temperatura!`, 'success');
            
        } catch (error) {
            UIHelpers.showAlert('Greška: ' + error.message, 'error');
        } finally {
            UIHelpers.hideLoading();
        }
    }
    
    openDayEditor(dateStr, dayData = null) {
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
                               value="${dayData ? dayData.potrosnja : 0}" 
                               class="form-input" aria-describedby="potrosnjaHelp">
                        <small id="potrosnjaHelp" class="form-help">1 džak = 15kg</small>
                    </div>
                    <div class="form-group">
                        <label for="dayTemperatura">Temperatura (°C):</label>
                        <div class="temperature-input-group">
                            <input type="number" id="dayTemperatura" step="0.1" 
                                   value="${dayData ? dayData.temperatura : 0}" 
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
        
        const preostalo = season.pocetnaKolicina - ukupnaPotrosnja;
        const pocetak = new Date(season.period.start);
        const kraj = new Date(season.period.end);
        const ukupnoDanaSezone = Math.ceil((kraj - pocetak) / (1000 * 60 * 60 * 24)) + 1;
        const preostaloDana = Math.max(0, ukupnoDanaSezone - brojDana);
        const potrosnjaDoKraja = preostaloDana * prosecnaDnevna;
        const prognozaZaliha = preostalo - potrosnjaDoKraja;
        
        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-value">${UIHelpers.formatNumber(ukupnaPotrosnja)}</div>
                    <div class="stat-label">Ukupno džakova</div>
                    <div class="stat-sub">${UIHelpers.formatNumber(ukupnaPotrosnjaKg)} kg</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${UIHelpers.formatNumber(prosecnaDnevna, 2)}</div>
                    <div class="stat-label">Dnevno</div>
                    <div class="stat-sub">${daniSaPotrosnjom} dana sipanja</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${UIHelpers.formatNumber(preostalo)}</div>
                    <div class="stat-label">Preostalo</div>
                    <div class="stat-sub">${prognozaZaliha >= 0 ? '✅ OK' : '❌ MALO'}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${UIHelpers.formatNumber(prosecnaTemp, 1)}</div>
                    <div class="stat-label">Prosečna temp</div>
                    <div class="stat-sub">${daniSaTemperaturom}/${brojDana} dana</div>
                </div>
            </div>
            
            ${prognozaZaliha < 0 ? `
                <div class="warning-banner">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>UPOZORENJE:</strong> Nedostaje ${UIHelpers.formatNumber(Math.abs(prognozaZaliha))} džakova!
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
                    <td>${UIHelpers.formatNumber(data.potrosnja, 1)}</td>
                    <td>${UIHelpers.formatNumber(data.potrosnjaKg, 0)}</td>
                    <td>${UIHelpers.formatNumber(prosecnaDnevna, 2)}</td>
                    <td>${UIHelpers.formatNumber(prosecnaTemp, 1)}</td>
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
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        borderWidth: 2,
                        yAxisID: 'y',
                        fill: true,
                        tension: 0.1
                    },
                    {
                        label: 'Temperatura (°C)',
                        data: tempData,
                        borderColor: '#e74c3c',
                        backgroundColor: 'rgba(231, 76, 60, 0.1)',
                        borderWidth: 2,
                        yAxisID: 'y1',
                        fill: true,
                        tension: 0.4
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
                scales: {
                    x: {
                        grid: {
                            display: true
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Džakovi'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: '°C'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += UIHelpers.formatNumber(context.parsed.y, 
                                        context.datasetIndex === 0 ? 2 : 1);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

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
                            <th>Ukupno dž</th>
                            <th>Dnevno</th>
                            <th>Temp (°C)</th>
                            <th>Efikasnost</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        seasons.forEach(season => {
            const daysArray = Object.values(season.days);
            const ukupnaPotrosnja = daysArray.reduce((sum, dan) => sum + (dan.potrosnja || 0), 0);
            const brojDana = daysArray.length;
            const prosecnaDnevna = brojDana > 0 ? ukupnaPotrosnja / brojDana : 0;
            
            const daniSaTemperaturom = daysArray.filter(d => d.temperatura !== 0).length;
            const prosecnaTemp = daniSaTemperaturom > 0 ? 
                daysArray.reduce((sum, dan) => sum + (dan.temperatura || 0), 0) / daniSaTemperaturom : 0;
            
            const effIndex = prosecnaTemp !== 0 ? prosecnaDnevna / Math.abs(prosecnaTemp) : 0;
            
            const pocetak = new Date(season.period.start);
            const kraj = new Date(season.period.end);
            const period = `${pocetak.toLocaleDateString('sr-RS', { month: 'short' })} - ${kraj.toLocaleDateString('sr-RS', { month: 'short', year: 'numeric' })}`;
            
            const isActive = this.state.activeSeasonId === season.id;
            
            html += `
                <tr ${isActive ? 'class="active-season"' : ''}>
                    <td><strong>${UIHelpers.escapeHTML(season.naziv || season.id)}</strong>${isActive ? ' <i class="fas fa-star" style="color: #f39c12;"></i>' : ''}</td>
                    <td>${UIHelpers.escapeHTML(period)}</td>
                    <td>${brojDana}</td>
                    <td>${UIHelpers.formatNumber(ukupnaPotrosnja, 0)}</td>
                    <td>${UIHelpers.formatNumber(prosecnaDnevna, 2)}</td>
                    <td>${UIHelpers.formatNumber(prosecnaTemp, 1)}</td>
                    <td>${UIHelpers.formatNumber(effIndex, 3)}</td>
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
        const season = this.getActiveSeason();
        if (!season) {
            UIHelpers.showAlert('Izaberite sezonu prvo', 'error');
            return;
        }
        
        const daysArray = Object.values(season.days);
        const daysWithoutTemp = daysArray.filter(d => 
            d.temperatura === 0 || d.temperatura === null || d.temperatura === undefined
        );
        
        if (daysWithoutTemp.length === 0) {
            UIHelpers.showAlert('Sve temperature su popunjene!', 'info');
            return;
        }
        
        if (!confirm(`Popuni temperature za ${daysWithoutTemp.length} dana?\n\nNapomena: Koristiće se optimizovani batch API za brže dopunjavanje.`)) {
            return;
        }
        
        UIHelpers.showLoading();
        
        try {
            const seasonStart = season.period.start;
            const seasonEnd = season.period.end;
            
            UIHelpers.showAlert('Preuzimanje temperatura u toku...', 'info', 5000);
            
            const allTemperatures = await temperatureService.getTemperaturesForSeason(
                seasonStart, 
                seasonEnd
            );
            
            let updatedCount = 0;
            let estimatedCount = 0;
            
            Object.keys(season.days).forEach(dateStr => {
                const day = season.days[dateStr];
                if (day.temperatura === 0 || day.temperatura === null) {
                    const fetchedTemp = allTemperatures[dateStr];
                    
                    if (fetchedTemp !== undefined) {
                        day.temperatura = fetchedTemp;
                        day.updatedAt = new Date().toISOString();
                        updatedCount++;
                        
                        if (temperatureService.estimateTemperatureByMonth(dateStr) === fetchedTemp) {
                            estimatedCount++;
                        }
                    }
                }
            });
            
            season.meta.updatedAt = new Date().toISOString();
            dataManager.saveData(this.state);
            
            this.renderKalendar();
            this.renderRezime();
            this.renderStatistika();
            this.renderChart();
            
            let message = `Gotovo! Ažurirano ${updatedCount} temperatura.`;
            if (estimatedCount > 0) {
                message += ` ${estimatedCount} temperatura je procenjeno po mesecu.`;
            }
            
            UIHelpers.showAlert(message, 'success');
            
        } catch (error) {
            console.error('Error:', error);
            UIHelpers.showAlert('Greška pri dopuni temperatura: ' + error.message, 'error');
        } finally {
            UIHelpers.hideLoading();
        }
    }

    exportJSON() {
        try {
            const backupData = {
                version: '3.0',
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
            UIHelpers.showLoading();
            
            try {
                const jsonText = e.target.result;
                
                if (!jsonText || jsonText.trim() === '') {
                    throw new Error('Fajl je prazan');
                }
                
                const importedState = dataManager.importData(jsonText);
                
                if (!importedState || !importedState.seasons) {
                    throw new Error('Nema sezona za uvoz');
                }
                
                let summary = `Pronađeno ${Object.keys(importedState.seasons).length} sezona:\n\n`;
                Object.values(importedState.seasons).forEach((season, i) => {
                    const daysWithTemp = Object.values(season.days || {}).filter(d => d.temperatura !== 0).length;
                    summary += `${i+1}. ${season.id} (${Object.keys(season.days || {}).length} dana, ${daysWithTemp} sa temperaturom)\n`;
                });
                
                summary += `\nDodati sezone?`;
                
                if (!confirm(summary)) {
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
                    
                    setTimeout(() => {
                        if (confirm(`Želite li da dodate temperature za sezonu "${addedSeason.id}"?\n\nOvo će preuzeti podatke sa interneta.`)) {
                            this.dodajTemperatureZaSezonu();
                        }
                    }, 1000);
                }
                
            } catch (error) {
                console.error('Greška pri uvozu:', error);
                UIHelpers.showAlert('Greška pri uvozu: ' + error.message, 'error');
                fileInput.value = '';
            } finally {
                UIHelpers.hideLoading();
            }
        };
        
        reader.onerror = () => {
            UIHelpers.hideLoading();
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
                    <div class="backup-item">
                        <div class="backup-header">
                            <strong>Backup ${index + 1}</strong>
                            <span class="backup-date">${date.toLocaleString('sr-RS')}</span>
                        </div>
                        <div class="backup-info">
                            <span class="backup-reason">${backup.reason || 'Manual'}</span>
                            <span class="backup-count">${seasonCount} sezona</span>
                        </div>
                        <button class="btn btn-sm restore-backup-btn" data-index="${index}">
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
        
        this.state = backup.data || { version: '3.0', activeSeasonId: null, seasons: {} };
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
                version: '3.0',
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

document.addEventListener('DOMContentLoaded', () => {
    window.peletTracker = new PeletTracker();
});

window.addEventListener('beforeunload', () => {
    if (window.peletTracker) {
        window.peletTracker.destroy();
    }
});