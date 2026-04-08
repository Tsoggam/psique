(function () {
    'use strict';

    if (window.psiqueBrasiliaApp) {
        console.warn('ignorando execução duplicada');
        return;
    }
    window.psiqueBrasiliaApp = true;
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    let currentUserLevel = null;
    let currentUser = null;
    let allVideos = [];
    let currentVideoIndex = -1;
    let completedVideoIds = [];
    let isLoadingVideos = false;
    let isLoadingFiles = false;
    let currentFilter = 'default';
    let usersData = [];
    let currentFolder = null;
    let allFolders = [];
    let allFiles = [];
    let currentAccessLevelIds = [];

    const themeToggle = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedView = localStorage.getItem('viewMode') || 'grid';
    if (savedView === 'list') {
        document.querySelector('[data-view="list"]')?.classList.add('active');
        document.querySelector('[data-view="grid"]')?.classList.remove('active');
    }

    themeToggle?.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    window.addEventListener('DOMContentLoaded', async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            await showMemberScreen();
        }
    });

    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    document.getElementById('password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
        }
    });
    document.getElementById('close-modal-btn').addEventListener('click', closeVideoModal);
    document.getElementById('mark-complete-btn').addEventListener('click', markVideoComplete);
    document.getElementById('next-video-btn').addEventListener('click', playNextVideo);
    document.getElementById('close-folder-btn')?.addEventListener('click', closeFolderModal);
    document.querySelector('#folder-modal .modal-backdrop')?.addEventListener('click', closeFolderModal);

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.dataset.tab;
            switchTab(tabName);
        });
    });

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.currentTarget.dataset.view;
            switchView(view);
        });
    });

    document.querySelector('.modal-backdrop')?.addEventListener('click', closeVideoModal);

    async function handleLogin(event) {
        event.preventDefault();

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('login-error');

        errorDiv.classList.remove('show');
        errorDiv.textContent = '';

        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            await showMemberScreen();
        } catch (error) {
            errorDiv.textContent = 'Email ou senha incorretos. Tente novamente.';
            errorDiv.classList.add('show');
            console.error('Erro no login:', error);
        }
    }

    async function logUserActivity() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            await supabase
                .from('user_activity_logs')
                .upsert(
                    { user_id: user.id, last_login: new Date().toISOString() },
                    { onConflict: 'user_id' }
                );
        } catch (error) {
            console.error('Erro ao registrar atividade:', error);
        }
    }

    async function handleLogout() {
        try {
            await supabase.auth.signOut();
            window.location.reload();
        } catch (error) {
            console.error('Erro no logout:', error);
            window.location.reload();
        }
    }

    let lastScrollY = window.scrollY;
const topNav = document.querySelector('.top-nav');

window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    if (currentScrollY > lastScrollY && currentScrollY > 60) {
        topNav.style.transform = 'translateY(-100%)';
    } else {
        topNav.style.transform = 'translateY(0)';
    }
    lastScrollY = currentScrollY;
}, { passive: true });

    async function showMemberScreen() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Usuário não encontrado');

            currentUser = user;
            await logUserActivity();

            const { data: userProfile } = await supabase
                .from('users')
                .select('name, full_name')
                .eq('id', user.id)
                .single();

            let displayName = userProfile?.full_name || userProfile?.name
                || user.user_metadata?.full_name || user.user_metadata?.name
                || user.email.split('@')[0];

            const capitalizeFirstLetter = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
            const firstName = displayName.split(' ')[0];
            const formattedName = capitalizeFirstLetter(firstName);
            document.getElementById('welcome-message').textContent = `Bem-vindo(a), ${formattedName}! 😊`;

            const { data: userAccess } = await supabase
                .from('user_access')
                .select('access_level_id, access_levels(name)')
                .eq('user_id', user.id);

            if (!userAccess || userAccess.length === 0) throw new Error('Sem permissões de acesso');

            currentAccessLevelIds = userAccess.map(a => a.access_level_id);
            currentUserLevel = userAccess[0].access_level_id;

            if (currentUserLevel !== 3) initAntiInspect();

            const badge = document.getElementById('user-badge');

            if (currentUserLevel === 1) {
                badge.innerHTML = 'Psicólogos';
                document.getElementById('admin-panel').style.display = 'none';
                document.querySelector('.container').style.display = 'block';
            } else if (currentUserLevel === 2) {
                badge.innerHTML = 'Administrativo';
                document.getElementById('admin-panel').style.display = 'none';
                document.querySelector('.container').style.display = 'block';
            } else if (currentUserLevel === 3) {
                badge.innerHTML = 'Desenvolvedor';

                document.getElementById('login-screen').classList.remove('active');
                document.getElementById('member-screen').classList.add('active');

                document.getElementById('top-nav-default').style.display = 'none';
                const mainContainer = document.querySelector('#member-screen > .container');
                if (mainContainer) mainContainer.style.display = 'none';

                document.getElementById('user-badge-admin').innerHTML = 'Desenvolvedor';
                document.getElementById('logout-btn-admin').addEventListener('click', handleLogout);

                const adminPanel = document.getElementById('admin-panel');
                if (adminPanel) {
                    adminPanel.style.display = 'block';
                    adminPanel.style.visibility = 'visible';
                    adminPanel.style.opacity = '1';
                }

                await loadAdminDashboard();
                return;
            } else {
                badge.innerHTML = '<i class="fa-solid fa-exclamation"></i>';
            }

            document.getElementById('login-screen').classList.remove('active');
            document.getElementById('member-screen').classList.add('active');

            await loadVideos();
            await loadFiles();

        } catch (error) {
            console.error('Erro ao carregar área:', error);
            alert('Erro ao carregar sua área. Tente novamente.');
            await handleLogout();
        }
    }

    function getLevelLabel(levelId) {
        const labels = { 1: 'Psicólogos', 2: 'Administrativo', 3: 'Desenvolvedor' };
        return labels[levelId] || `Nível ${levelId}`;
    }

    async function loadVideos() {
        if (isLoadingVideos) return;
        isLoadingVideos = true;

        const loading = document.getElementById('videos-loading');
        const container = document.getElementById('videos-container');
        const noVideos = document.getElementById('no-videos');

        loading.style.display = 'block';
        container.innerHTML = '';
        noVideos.style.display = 'none';

        try {
            const accessLevelIds = currentAccessLevelIds;

            if (!accessLevelIds.length) {
                loading.style.display = 'none';
                noVideos.style.display = 'block';
                return;
            }

            const { data: videos, error } = await supabase
                .from('videos')
                .select('*, access_levels(name)')
                .in('access_level_id', accessLevelIds)
                .order('order_index', { ascending: true });

            if (error) throw error;

            loading.style.display = 'none';

            if (!videos || videos.length === 0) {
                noVideos.style.display = 'block';
                return;
            }

            const { data: completedVideos } = await supabase
                .from('video_progress')
                .select('video_id')
                .eq('user_id', currentUser.id)
                .eq('completed', true);

            completedVideoIds = completedVideos?.map(v => v.video_id) || [];
            allVideos = videos;

            const videoHierarchy = organizeVideoHierarchy(videos);

            const levelIds = [...new Set(videos.map(v => v.access_level_id))].sort();
            const multiLevel = levelIds.length > 1;

            if (multiLevel) {
                levelIds.forEach(levelId => {
                    const levelVideos = videoHierarchy.filter(g => g.main.access_level_id === levelId);
                    if (!levelVideos.length) return;

                    const header = document.createElement('div');
                    header.className = 'level-section-header';
                    header.innerHTML = `
                        <span class="level-badge">${getLevelLabel(levelId)}</span>
                        <h3>${getLevelLabel(levelId)}</h3>
                    `;
                    container.appendChild(header);

                    let flatIndex = allVideos.indexOf(levelVideos[0].main);
                    levelVideos.forEach(videoGroup => {
                        const mainVideo = videoGroup.main;
                        if (mainVideo.parent_video_id) return;
                        const idx = allVideos.indexOf(mainVideo);
                        const isCompleted = completedVideoIds.includes(mainVideo.id);
                        const isLocked = isVideoLocked(mainVideo, idx);
                        const card = createVideoCard(mainVideo, idx, isCompleted, isLocked, false, videoGroup.children.length);
                        container.appendChild(card);
                    });
                });
            } else {
                let flatIndex = 0;
                videoHierarchy.forEach(videoGroup => {
                    const mainVideo = videoGroup.main;
                    if (mainVideo.parent_video_id) return;
                    const isCompleted = completedVideoIds.includes(mainVideo.id);
                    const isLocked = isVideoLocked(mainVideo, flatIndex);
                    const card = createVideoCard(mainVideo, flatIndex, isCompleted, isLocked, false, videoGroup.children.length);
                    container.appendChild(card);
                    flatIndex++;
                });
            }

            const savedView = localStorage.getItem('viewMode') || 'grid';
            if (savedView === 'list') container.classList.add('list-view');

        } catch (error) {
            console.error('Erro ao carregar vídeos:', error);
            loading.style.display = 'none';
            container.innerHTML = '<div class="empty-state"><p style="color: #e74c3c;">Erro ao carregar vídeos</p></div>';
        } finally {
            isLoadingVideos = false;
        }
    }

    function organizeVideoHierarchy(videos) {
        const hierarchy = [];
        const videoMap = new Map();
        const sortedVideos = [...videos].sort((a, b) => a.order_index - b.order_index);

        sortedVideos.forEach(video => videoMap.set(video.id, { main: video, children: [] }));

        sortedVideos.forEach(video => {
            if (video.parent_video_id) {
                const parent = videoMap.get(video.parent_video_id);
                if (parent) parent.children.push(video);
            } else {
                hierarchy.push(videoMap.get(video.id));
            }
        });

        hierarchy.forEach(group => {
            if (group.children.length > 0) {
                group.children.sort((a, b) => {
                    if (a.order_index !== b.order_index) return a.order_index - b.order_index;
                    if (a.section_number && b.section_number) return parseFloat(a.section_number) - parseFloat(b.section_number);
                    return 0;
                });
            }
        });

        return hierarchy;
    }

    async function loadFiles() {
        if (isLoadingFiles) return;
        isLoadingFiles = true;

        const loading = document.getElementById('files-loading');
        const container = document.getElementById('files-container');
        const noFiles = document.getElementById('no-files');

        loading.style.display = 'block';
        container.innerHTML = '';
        noFiles.style.display = 'none';

        try {
            const accessLevelIds = currentAccessLevelIds;

            if (!accessLevelIds.length) {
                loading.style.display = 'none';
                noFiles.style.display = 'block';
                return;
            }

            const [foldersRes, filesRes] = await Promise.all([
                supabase.from('folders').select('*, access_levels(name)').in('access_level_id', accessLevelIds).order('created_at', { ascending: false }),
                supabase.from('files').select('*, access_levels(name)').in('access_level_id', accessLevelIds).order('order_files', { ascending: true, nullsFirst: false })
            ]);

            if (foldersRes.error) throw foldersRes.error;
            if (filesRes.error) throw filesRes.error;

            loading.style.display = 'none';

            allFolders = foldersRes.data || [];
            allFiles = filesRes.data || [];

            const levelIds = [...new Set([
                ...allFolders.map(f => f.access_level_id),
                ...allFiles.filter(f => !f.folder_id).map(f => f.access_level_id)
            ])].filter(Boolean).sort();

            const multiLevel = levelIds.length > 1;

            if (multiLevel) {
                levelIds.forEach(levelId => {
                    const levelFolders = allFolders.filter(f => f.access_level_id === levelId);
                    const levelStandalone = allFiles.filter(f => !f.folder_id && f.access_level_id === levelId);

                    if (!levelFolders.length && !levelStandalone.length) return;

                    const header = document.createElement('div');
                    header.className = 'level-section-header';
                    header.innerHTML = `
                        <span class="level-badge">${getLevelLabel(levelId)}</span>
                        <h3>${getLevelLabel(levelId)}</h3>
                    `;
                    container.appendChild(header);

                    levelFolders.forEach(folder => container.appendChild(createFolderCard(folder)));
                    levelStandalone.forEach(file => container.appendChild(createFileCard(file)));
                });
            } else {
                allFolders.forEach(folder => container.appendChild(createFolderCard(folder)));
                allFiles.filter(f => !f.folder_id).forEach(file => container.appendChild(createFileCard(file)));
            }

            const hasContent = allFolders.length > 0 || allFiles.filter(f => !f.folder_id).length > 0;
            if (!hasContent) noFiles.style.display = 'block';

            const savedView = localStorage.getItem('viewMode') || 'grid';
            if (savedView === 'list') container.classList.add('list-view');

        } catch (error) {
            console.error('Erro ao carregar arquivos:', error);
            loading.style.display = 'none';
            container.innerHTML = '<div class="empty-state"><p style="color: #e74c3c;">Erro ao carregar materiais</p></div>';
        } finally {
            isLoadingFiles = false;
        }
    }

    function createVideoCard(video, index, isCompleted, isLocked, isSubVideo, subVideosCount = 0) {
        const defaultThumbnail = "https://hjeivflwulqtlkwvvmvw.supabase.co/storage/v1/object/public/thumbnail/Thumbnail.png";
        const card = document.createElement('div');
        card.className = 'content-card';
        card.dataset.videoId = video.id;

        if (isCompleted) card.classList.add('completed');
        if (isLocked) card.classList.add('locked');

        card.onclick = () => isLocked
            ? showToast('Você precisa completar a aula anterior para desbloquear este conteúdo.')
            : openVideoModal(video, index);

        const sectionNumber = video.section_number || (index + 1);

        card.innerHTML = `
        <span class="section-badge">${sectionNumber}</span>
        ${subVideosCount > 0 ? `
            <div class="sub-videos-count">
                <i class="fa-solid fa-layer-group"></i>
                <span>${subVideosCount} ${subVideosCount === 1 ? 'vídeo' : 'vídeos'}</span>
            </div>` : ''}
        <div class="video-thumbnail">
            <img src="${video.thumbnail_url || defaultThumbnail}" alt="${video.title}">
            ${!isLocked ? '<div class="play-icon">▶</div>' : ''}
        </div>
        ${isCompleted ? `
            <div class="completion-check">
                <i class="fa-regular fa-square-check"></i>
                <span>Concluído</span>
            </div>` : ''}
        ${isLocked ? `
            <div class="completion-check locked-indicator">
                <i class="fa-solid fa-lock"></i>
                <span>Bloqueado</span>
            </div>` : ''}
        <h3>${video.title}</h3>
        <p>${video.description || 'Sem descrição'}</p>
        `;

        return card;
    }

    function createFileCard(file) {
        const card = document.createElement('div');
        card.className = 'file-card';
        const icon = getFileIcon(file.name);
        card.innerHTML = `
        <div class="file-icon">${icon}</div>
        <h3>${file.name}</h3>
        <p>${file.description || 'Sem descrição'}</p>
        <button class="btn" title="Baixar arquivo">
            <i class="fa-solid fa-download"></i>
        </button>
        `;
        card.querySelector('button').addEventListener('click', () => downloadFile(file.file_url, file.name));
        return card;
    }

    function createFileCardWithFolder(file, parentFolder) {
        const card = document.createElement('div');
        card.className = 'file-card';
        const icon = getFileIcon(file.name);
        card.innerHTML = `
        <div class="file-icon">${icon}</div>
        ${parentFolder ? `
            <div class="badge" style="margin-bottom: 8px; background: rgba(107, 155, 124, 0.15); color: var(--primary); display: flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-folder" style="font-size: 12px;"></i>
                <span>${parentFolder.name}</span>
            </div>` : ''}
        <h3>${file.name}</h3>
        <p>${file.description || 'Sem descrição'}</p>
        <button class="btn" title="Baixar arquivo">
            <i class="fa-solid fa-download"></i>
        </button>
        `;
        card.querySelector('button').addEventListener('click', () => downloadFile(file.file_url, file.name));
        return card;
    }

    function createPlaylist() {
        const playlistContainer = document.getElementById('playlist-items');
        playlistContainer.innerHTML = '';

        document.getElementById('playlist-progress-text').textContent =
            `${completedVideoIds.length} de ${allVideos.length} concluídas`;

        const videoHierarchy = organizeVideoHierarchy(allVideos);
        let flatIndex = 0;

        videoHierarchy.forEach(videoGroup => {
            const mainVideo = videoGroup.main;
            if (mainVideo.parent_video_id) return;

            const isCompleted = completedVideoIds.includes(mainVideo.id);
            const isLocked = isVideoLocked(mainVideo, flatIndex);
            const isActive = flatIndex === currentVideoIndex;

            playlistContainer.appendChild(createPlaylistItem(mainVideo, flatIndex, isCompleted, isLocked, isActive, false));
            flatIndex++;

            if (videoGroup.children?.length > 0) {
                videoGroup.children.forEach((subVideo) => {
                    const subCompleted = completedVideoIds.includes(subVideo.id);
                    const subLocked = isVideoLocked(subVideo, flatIndex);
                    const subActive = flatIndex === currentVideoIndex;
                    playlistContainer.appendChild(createPlaylistItem(subVideo, flatIndex, subCompleted, subLocked, subActive, true));
                    flatIndex++;
                });
            }
        });
    }

    function createPlaylistItem(video, index, isCompleted, isLocked, isActive, isSubVideo) {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', isLocked ? '-1' : '0');

        if (isCompleted) item.classList.add('completed');
        if (isLocked) item.classList.add('locked');
        if (isActive) item.classList.add('active');
        if (isSubVideo) item.classList.add('sub-video');

        const statusText = isLocked ? 'Bloqueado' : isCompleted ? 'Concluído' : 'Não iniciado';
        const sectionNumber = video.section_number || (index + 1);

        item.innerHTML = `
        <div class="playlist-item-number">${!isLocked && !isCompleted ? sectionNumber : ''}</div>
        <div class="playlist-item-info">
            <div class="playlist-item-title">${video.title}</div>
            <div class="playlist-item-duration">${statusText}</div>
        </div>
        `;

        if (!isLocked) {
            item.onclick = () => openVideoModal(video, index);
            item.onkeypress = (e) => {
                if (e.key === 'Enter' || e.key === ' ') openVideoModal(video, index);
            };
        }

        return item;
    }

    async function openVideoModal(video, index) {
        currentVideoIndex = index;
        const modal = document.getElementById('video-modal');
        const player = document.getElementById('video-player');

        const { data: progressData } = await supabase
            .from('video_progress')
            .select('completed')
            .eq('user_id', currentUser.id)
            .eq('video_id', video.id)
            .maybeSingle();

        const isCompleted = progressData?.completed || false;

        document.getElementById('video-title').textContent = video.title;
        document.getElementById('video-description').textContent = video.description || 'Sem descrição';

        const markCompleteBtn = document.getElementById('mark-complete-btn');
        const nextVideoBtn = document.getElementById('next-video-btn');
        const watchedIndicator = document.getElementById('video-watched-indicator');

        if (isCompleted) {
            markCompleteBtn.disabled = true;
            markCompleteBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span>Concluída</span>`;
            watchedIndicator.classList.add('show');
            nextVideoBtn.style.display = index < allVideos.length - 1 ? 'flex' : 'none';
        } else {
            markCompleteBtn.disabled = false;
            markCompleteBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span>Marcar como concluído</span>`;
            watchedIndicator.classList.remove('show');
            nextVideoBtn.style.display = 'none';
        }

        renderVideoPlayer(player, video);
        await loadVideoFiles(video.id);
        createPlaylist();

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    async function loadVideoFiles(videoId) {
        const container = document.getElementById('video-files-container');

        try {
            const { data: videoFiles, error } = await supabase
                .from('video_files')
                .select(`file_id, display_order, files(id, name, description, file_url)`)
                .eq('video_id', videoId)
                .order('display_order', { ascending: true });

            if (error) throw error;

            container.innerHTML = '';

            if (!videoFiles || videoFiles.length === 0) {
                container.style.display = 'none';
                return;
            }

            container.style.display = 'block';

            const header = document.createElement('div');
            header.className = 'video-files-header';
            header.innerHTML = `
            <h3><i class="fa-solid fa-file-arrow-down"></i></h3>
            <span class="files-count">${videoFiles.length} ${videoFiles.length === 1 ? 'arquivo' : 'arquivos'}</span>
            `;
            container.appendChild(header);

            const filesList = document.createElement('div');
            filesList.className = 'video-files-list';

            videoFiles.forEach(vf => {
                const file = vf.files;
                if (!file) return;
                const fileCard = document.createElement('div');
                fileCard.className = 'video-file-item';
                const icon = getFileIcon(file.name);
                fileCard.innerHTML = `
                <div class="video-file-icon">${icon}</div>
                <div class="video-file-info">
                    <h4>${file.name}</h4>
                    ${file.description ? `<p>${file.description}</p>` : ''}
                </div>
                <button class="btn-download" title="Baixar arquivo">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span>Baixar</span>
                </button>
                `;
                fileCard.querySelector('button').addEventListener('click', () => downloadFile(file.file_url, file.name));
                filesList.appendChild(fileCard);
            });

            container.appendChild(filesList);

        } catch (error) {
            console.error('Erro ao carregar arquivos do vídeo:', error);
            container.style.display = 'none';
        }
    }

    function renderVideoPlayer(player, video) {
        const url = video.video_url;

        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const videoId = extractYouTubeId(url);
            player.innerHTML = `
            <iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&showinfo=0"
                frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen title="Video player"></iframe>`;
        } else if (url.includes('vimeo.com')) {
            const videoId = url.split('/').pop().split('?')[0];
            player.innerHTML = `
            <iframe src="https://player.vimeo.com/video/${videoId}?autoplay=1&title=0&byline=0&portrait=0"
                frameborder="0" allow="autoplay; fullscreen; picture-in-picture"
                allowfullscreen title="Video player"></iframe>`;
        } else if (url.includes('drive.google.com')) {
            let embedUrl = url;
            if (url.includes('/file/d/')) {
                const fileId = url.split('/file/d/')[1].split('/')[0];
                embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
            } else if (url.includes('id=')) {
                const fileId = url.split('id=')[1].split('&')[0];
                embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
            } else if (url.includes('/view')) {
                embedUrl = url.replace('/view', '/preview');
            }
            player.innerHTML = `
            <iframe src="${embedUrl}" frameborder="0" allow="autoplay" allowfullscreen title="Video player"
                sandbox="allow-scripts allow-same-origin allow-presentation"></iframe>`;
        } else {
            player.innerHTML = `
            <video controls controlsList="nodownload" autoplay title="Video player">
                <source src="${url}" type="video/mp4">
                Seu navegador não suporta vídeo.
            </video>`;
        }
    }

    function closeVideoModal() {
        const modal = document.getElementById('video-modal');
        const player = document.getElementById('video-player');
        player.innerHTML = '';
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }

    async function markVideoComplete() {
        const video = allVideos[currentVideoIndex];
        const markCompleteBtn = document.getElementById('mark-complete-btn');
        const nextVideoBtn = document.getElementById('next-video-btn');
        const watchedIndicator = document.getElementById('video-watched-indicator');

        markCompleteBtn.disabled = true;
        markCompleteBtn.innerHTML = '<span>Salvando...</span>';

        try {
            const { error } = await supabase
                .from('video_progress')
                .upsert({
                    user_id: currentUser.id,
                    video_id: video.id,
                    completed: true,
                    completed_at: new Date().toISOString()
                }, { onConflict: 'user_id,video_id' });

            if (error) throw error;

            if (!completedVideoIds.includes(video.id)) completedVideoIds.push(video.id);

            markCompleteBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span>Aula concluída</span>`;
            watchedIndicator.classList.add('show');

            if (currentVideoIndex < allVideos.length - 1) nextVideoBtn.style.display = 'flex';

            createPlaylist();

            const card = document.querySelector(`.content-card[data-video-id="${video.id}"]`);
            if (card) {
                card.classList.add('completed');
                card.querySelector('.locked-indicator')?.remove();
                if (!card.querySelector('.completion-check')) {
                    card.insertAdjacentHTML('beforeend', `
                        <div class="completion-check">
                            <i class="fa-regular fa-square-check"></i>
                            <span>Concluído</span>
                        </div>`);
                }

                const nextCard = document.querySelector(`.content-card[data-video-id="${allVideos[currentVideoIndex + 1]?.id}"]`);
                if (nextCard) {
                    nextCard.classList.remove('locked');
                    nextCard.onclick = () => openVideoModal(allVideos[currentVideoIndex + 1], currentVideoIndex + 1);
                    nextCard.querySelector('.locked-indicator')?.remove();
                    nextCard.querySelector('.video-thumbnail')?.insertAdjacentHTML('beforeend', '<div class="play-icon">▶</div>');
                }
            }

            showToast('✅ Aula concluída! Próxima aula disponível.');

        } catch (error) {
            console.error('Erro ao marcar vídeo:', error);
            markCompleteBtn.disabled = false;
            markCompleteBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span>Marcar concluída</span>`;
            showToast('❌ Erro ao salvar progresso. Tente novamente.');
        }
    }

    function playNextVideo() {
        if (currentVideoIndex < allVideos.length - 1) {
            const nextVideo = allVideos[currentVideoIndex + 1];
            closeVideoModal();
            setTimeout(() => openVideoModal(nextVideo, currentVideoIndex + 1), 300);
        }
    }

    function extractYouTubeId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    async function downloadFile(url, filename) {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
            showToast('✅ Download iniciado!');
        } catch (error) {
            window.open(url, '_blank');
            showToast('📥 Arquivo aberto em nova aba');
        }
    }

    window.downloadFile = downloadFile;

    function getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const icons = {
            pdf: '<i class="fa-solid fa-file-pdf"></i>',
            doc: '<i class="fa-solid fa-file"></i>',
            docx: '<i class="fa-regular fa-file-word"></i>',
            xls: '<i class="fa-solid fa-file-excel"></i>',
            xlsx: '<i class="fa-solid fa-file-excel"></i>',
            ppt: '<i class="fa-solid fa-file-powerpoint"></i>',
            pptx: '<i class="fa-solid fa-file-powerpoint"></i>',
            zip: '<i class="fa-solid fa-file-zipper"></i>',
            rar: '<i class="fa-solid fa-file-zipper"></i>',
            mp4: '<i class="fa-solid fa-file-video"></i>',
            mkv: '<i class="fa-solid fa-file-video"></i>',
            mp3: '<i class="fa-solid fa-file-audio"></i>',
            jpg: '<i class="fa-solid fa-file-image"></i>',
            jpeg: '<i class="fa-solid fa-file-image"></i>',
            png: '<i class="fa-solid fa-file-image"></i>',
            gif: '<i class="fa-solid fa-file-image"></i>'
        };
        return icons[ext] || '<i class="fa-regular fa-hard-drive"></i>';
    }

    function switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    function switchView(view) {
        localStorage.setItem('viewMode', view);
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-view="${view}"]`).classList.add('active');

        const videosContainer = document.getElementById('videos-container');
        const filesContainer = document.getElementById('files-container');
        if (view === 'list') {
            videosContainer.classList.add('list-view');
            filesContainer.classList.add('list-view');
        } else {
            videosContainer.classList.remove('list-view');
            filesContainer.classList.remove('list-view');
        }
    }

    function showToast(message) {
        document.querySelector('.custom-toast')?.remove();
        const toast = document.createElement('div');
        toast.className = 'custom-toast';
        toast.style.cssText = `
            position: fixed; bottom: 30px; right: 30px;
            background: rgba(45, 52, 54, 0.95); color: white;
            padding: 16px 24px; border-radius: 12px; font-weight: 600;
            z-index: 10000; animation: slideInUp 0.3s ease;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3); max-width: 400px;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'slideOutDown 0.3s ease';
            setTimeout(() => toast.parentNode && document.body.removeChild(toast), 300);
        }, 4000);
    }

    function isVideoLocked(video, index) {
        if (video.unlocked === true) return false;
        if (index === 0) return false;
        const previousVideo = allVideos[index - 1];
        return !(previousVideo && completedVideoIds.includes(previousVideo.id));
    }

    const originalConsoleError = console.error;
    console.error = function (...args) {
        const errorString = args.join(' ');
        if (
            errorString.includes('Content Security Policy') ||
            errorString.includes('frame-ancestors') ||
            errorString.includes('ssl.gstatic.com') ||
            errorString.includes('drive.google.com') ||
            errorString.includes('aria-hidden')
        ) return;
        originalConsoleError.apply(console, args);
    };

    function createFolderCard(folder) {
        const card = document.createElement('div');
        card.className = 'folder-card';
        const filesCount = allFiles.filter(f => f.folder_id === folder.id).length;
        card.innerHTML = `
        <div class="folder-icon"><i class="fa-solid fa-folder"></i></div>
        <h3>${folder.name}</h3>
        <p>${folder.description || 'Sem descrição'}</p>
        <div class="folder-files-count">
            <i class="fa-solid fa-file"></i>
            <span>${filesCount} ${filesCount === 1 ? 'arquivo' : 'arquivos'}</span>
        </div>
        `;
        card.addEventListener('click', () => openFolderModal(folder));
        return card;
    }

    async function openFolderModal(folder) {
        currentFolder = folder;
        const modal = document.getElementById('folder-modal');
        const loading = document.getElementById('folder-files-loading');
        const container = document.getElementById('folder-files-container');
        const noFiles = document.getElementById('folder-no-files');

        document.getElementById('folder-modal-title').textContent = folder.name;
        document.getElementById('folder-modal-description').textContent = folder.description || 'Sem descrição';

        loading.style.display = 'block';
        container.innerHTML = '';
        noFiles.style.display = 'none';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        try {
            const folderFiles = allFiles.filter(f => f.folder_id === folder.id);
            loading.style.display = 'none';
            if (!folderFiles.length) { noFiles.style.display = 'block'; return; }
            folderFiles.forEach(file => container.appendChild(createFolderFileCard(file)));
        } catch (error) {
            console.error('Erro ao carregar arquivos da pasta:', error);
            loading.style.display = 'none';
            container.innerHTML = '<div class="empty-state"><p style="color: #e74c3c;">Erro ao carregar arquivos</p></div>';
        }
    }

    function createFolderFileCard(file) {
        const card = document.createElement('div');
        card.className = 'folder-file-card';
        const icon = getFileIcon(file.name);
        card.innerHTML = `
        <div class="folder-file-icon">${icon}</div>
        <div class="folder-file-info">
            <h4>${file.name}</h4>
            ${file.description ? `<p>${file.description}</p>` : ''}
        </div>
        <button class="btn-download-small" title="Baixar arquivo">
            <i class="fa-solid fa-download"></i>
        </button>
        `;
        card.querySelector('button').addEventListener('click', () => downloadFile(file.file_url, file.name));
        return card;
    }

    function closeFolderModal() {
        document.getElementById('folder-modal').classList.remove('active');
        document.body.style.overflow = 'auto';
        currentFolder = null;
    }

    document.getElementById('files-search')?.addEventListener('input', handleFilesSearch);
    document.getElementById('clear-search')?.addEventListener('click', clearFilesSearch);

    function handleFilesSearch(e) {
        const searchTerm = e.target.value.toLowerCase().trim();
        const clearBtn = document.getElementById('clear-search');
        const container = document.getElementById('files-container');
        const noResults = document.getElementById('no-search-results');
        const noFiles = document.getElementById('no-files');

        if (!searchTerm) {
            clearBtn.style.display = 'none';
            noResults.style.display = 'none';
            noFiles.style.display = (allFolders.length === 0 && allFiles.filter(f => !f.folder_id).length === 0) ? 'block' : 'none';
            loadFiles();
            return;
        }

        clearBtn.style.display = 'flex';

        const filteredFolders = allFolders.filter(f =>
            f.name.toLowerCase().includes(searchTerm) ||
            (f.description && f.description.toLowerCase().includes(searchTerm))
        );
        const standaloneFiles = allFiles.filter(f =>
            !f.folder_id && (
                f.name.toLowerCase().includes(searchTerm) ||
                (f.description && f.description.toLowerCase().includes(searchTerm))
            )
        );
        const filesInsideFolders = allFiles.filter(f =>
            f.folder_id && (
                f.name.toLowerCase().includes(searchTerm) ||
                (f.description && f.description.toLowerCase().includes(searchTerm))
            )
        );

        container.innerHTML = '';
        noFiles.style.display = 'none';

        if (!filteredFolders.length && !standaloneFiles.length && !filesInsideFolders.length) {
            noResults.style.display = 'block';
        } else {
            noResults.style.display = 'none';
            filteredFolders.forEach(folder => container.appendChild(createFolderCard(folder)));
            standaloneFiles.forEach(file => container.appendChild(createFileCard(file)));
            filesInsideFolders.forEach(file => {
                const parentFolder = allFolders.find(f => f.id === file.folder_id);
                container.appendChild(createFileCardWithFolder(file, parentFolder));
            });
        }
    }

    function clearFilesSearch() {
        document.getElementById('files-search').value = '';
        document.getElementById('clear-search').style.display = 'none';
        document.getElementById('no-search-results').style.display = 'none';
        loadFiles();
    }

    function initAntiInspect() {
        document.addEventListener('contextmenu', e => { e.preventDefault(); return false; });
        document.addEventListener('keydown', e => {
            if (e.key === 'F12') { e.preventDefault(); return false; }
            if (e.ctrlKey && e.shiftKey && ['i', 'I', 'j', 'J', 'c', 'C'].includes(e.key)) { e.preventDefault(); return false; }
            if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); return false; }
        });
    }

    async function loadAdminDashboard() {
        try {
            const [usersResult, videosResult, progressResult, activityResult] = await Promise.all([
                supabase.from('users').select('id, name, full_name'),
                supabase.from('videos').select('*'),
                supabase.from('video_progress').select('*'),
                supabase.from('user_activity_logs').select('user_id, last_login').order('last_login', { ascending: false })
            ]);

            if (usersResult.error) throw usersResult.error;

            const users = usersResult.data || [];
            const videos = videosResult.data || [];
            const allProgress = progressResult.data || [];
            const activities = activityResult.data || [];

            const activityMap = {};
            activities.forEach(a => { if (!activityMap[a.user_id]) activityMap[a.user_id] = a.last_login; });
            allProgress.forEach(p => { if (!activityMap[p.user_id] && p.completed_at) activityMap[p.user_id] = p.completed_at; });

            const totalCompletions = allProgress.filter(p => p.completed).length;
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const activeUsers = users.filter(u => activityMap[u.id] && new Date(activityMap[u.id]) > sevenDaysAgo).length;

            document.getElementById('total-users').textContent = users.length;
            document.getElementById('total-videos').textContent = videos.length;
            document.getElementById('total-completions').textContent = totalCompletions;
            document.getElementById('active-users').textContent = activeUsers;

            await loadUserDetailsTable(users, videos.length, allProgress, activityMap);
            await loadProgressChart(users, videos.length, allProgress);
            await loadLevelDistributionChart(users);

            setupFilterDropdown();
        } catch (error) {
            console.error('❌ Erro ao carregar dashboard:', error);
            alert('Erro ao carregar o dashboard. Verifique o console para mais detalhes.');
        }
    }

    async function loadProgressChart(users, totalVideos, allProgress) {
        const container = document.getElementById('user-progress-chart');

        const userProgressData = users.map(user => {
            const completedCount = allProgress.filter(p => p.user_id === user.id && p.completed).length;
            const progressPercent = totalVideos > 0 ? Math.round((completedCount / totalVideos) * 100) : 0;
            return {
                name: user.full_name || user.name || `Usuário ${user.id.substring(0, 8)}`,
                progress: progressPercent,
                completed: completedCount
            };
        }).sort((a, b) => b.progress - a.progress).slice(0, 10);

        let chartHTML = '<div style="display: flex; flex-direction: column; gap: 15px;">';

        userProgressData.forEach((user, index) => {
            chartHTML += `
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="min-width: 30px; font-weight: 700; color: var(--primary);">#${index + 1}</div>
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="font-weight: 600; color: var(--text-dark);">${user.name}</span>
                        <span style="font-weight: 700; color: var(--primary);">${user.progress}%</span>
                    </div>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${user.progress}%"></div></div>
                    <small style="color: var(--text-gray); margin-top: 3px; display: block;">${user.completed} vídeos concluídos</small>
                </div>
            </div>`;
        });

        chartHTML += '</div>';
        container.innerHTML = chartHTML;
    }

    async function loadUserDetailsTable(users, totalVideos, allProgress, activityMap) {
        const { data: accessData } = await supabase
            .from('user_access')
            .select('user_id, access_level_id, access_levels(name)');

        const accessMap = {};
        if (accessData) {
            accessData.forEach(a => {
                accessMap[a.user_id] = { level_id: a.access_level_id, level_name: a.access_levels?.name || 'Desconhecido' };
            });
        }

        usersData = users.map(user => {
            const userName = user.full_name || user.name || `Usuário ${user.id.substring(0, 8)}`;
            const completedCount = allProgress.filter(p => p.user_id === user.id && p.completed).length;
            const progressPercent = totalVideos > 0 ? Math.round((completedCount / totalVideos) * 100) : 0;
            const accessInfo = accessMap[user.id] || { level_id: 0, level_name: 'Sem acesso' };

            let lastLogin = 'Nunca';
            let lastLoginRaw = null;
            if (activityMap[user.id]) {
                lastLoginRaw = activityMap[user.id];
                lastLogin = new Date(lastLoginRaw).toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });
            }

            return { userName, accessInfo, progressPercent, completedCount, totalVideos, lastLogin, lastLoginRaw };
        });

        renderUsersTable(usersData);
    }

    async function loadLevelDistributionChart(users) {
        const container = document.getElementById('level-distribution-chart');
        const { data: accessData } = await supabase.from('user_access').select('access_level_id, access_levels(name)');

        const levelCounts = {
            1: { name: 'Psicólogos', count: 0, color: '#6B9B7C' },
            2: { name: 'Administrativo', count: 0, color: '#3498db' },
            3: { name: 'Desenvolvedores', count: 0, color: '#9b59b6' }
        };

        if (accessData) accessData.forEach(a => { if (levelCounts[a.access_level_id]) levelCounts[a.access_level_id].count++; });

        const total = Object.values(levelCounts).reduce((sum, l) => sum + l.count, 0);
        let chartHTML = '<div style="display: flex; flex-direction: column; gap: 20px;">';

        Object.values(levelCounts).forEach(level => {
            const percent = total > 0 ? Math.round((level.count / total) * 100) : 0;
            chartHTML += `
            <div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: var(--text-dark);">${level.name}</span>
                    <span style="font-weight: 700; color: ${level.color};">${level.count} usuários (${percent}%)</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percent}%; background: ${level.color};"></div>
                </div>
            </div>`;
        });

        chartHTML += '</div>';
        container.innerHTML = chartHTML;
    }

    function setupFilterDropdown() {
        const filterBtn = document.getElementById('filter-btn');
        const filterMenu = document.getElementById('filter-menu');
        if (!filterBtn || !filterMenu) return;

        filterBtn.addEventListener('click', (e) => { e.stopPropagation(); filterMenu.classList.toggle('active'); });
        document.addEventListener('click', (e) => {
            if (!filterMenu.contains(e.target) && e.target !== filterBtn) filterMenu.classList.remove('active');
        });

        document.querySelectorAll('.filter-option').forEach(option => {
            option.addEventListener('click', () => {
                const filter = option.dataset.filter;
                currentFilter = filter;
                document.querySelectorAll('.filter-option').forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                applyFilter(filter);
                filterMenu.classList.remove('active');
            });
        });
    }

    function applyFilter(filter) {
        let sortedUsers = [...usersData];
        switch (filter) {
            case 'level': sortedUsers.sort((a, b) => a.accessInfo.level_id - b.accessInfo.level_id); break;
            case 'recent': sortedUsers.sort((a, b) => {
                const dA = a.lastLogin === 'Nunca' ? new Date(0) : new Date(a.lastLoginRaw);
                const dB = b.lastLogin === 'Nunca' ? new Date(0) : new Date(b.lastLoginRaw);
                return dB - dA;
            }); break;
            case 'alphabetical': sortedUsers.sort((a, b) => a.userName.localeCompare(b.userName)); break;
            case 'completed': sortedUsers.sort((a, b) => b.completedCount - a.completedCount); break;
        }
        renderUsersTable(sortedUsers);
    }

    function renderUsersTable(users) {
        const container = document.getElementById('users-table');
        let tableHTML = `
        <table class="users-table">
            <thead>
                <tr>
                    <th>Usuário</th><th>Nível</th><th>Progresso</th><th>Vídeos Concluídos</th><th>Último Acesso</th>
                </tr>
            </thead>
            <tbody>`;

        users.forEach(user => {
            let levelClass = '';
            if (user.accessInfo.level_id === 1) levelClass = 'level-psicologos';
            else if (user.accessInfo.level_id === 2) levelClass = 'level-admin';
            else if (user.accessInfo.level_id === 3) levelClass = 'level-dev';

            tableHTML += `
            <tr>
                <td><strong>${user.userName}</strong></td>
                <td><span class="user-level-badge ${levelClass}">${user.accessInfo.level_name}</span></td>
                <td>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${user.progressPercent}%"></div></div>
                    <small style="color: var(--text-gray); margin-top: 5px; display: block;">${user.progressPercent}%</small>
                </td>
                <td><strong>${user.completedCount}</strong> / ${user.totalVideos}</td>
                <td>
                    <div class="last-login">
                        <i class="fa-solid fa-clock"></i>
                        ${user.lastLogin}
                    </div>
                </td>
            </tr>`;
        });

        tableHTML += '</tbody></table>';
        container.innerHTML = tableHTML;
    }

    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const target = tab.dataset.adminTab;
            if (tab.classList.contains('active')) return;

            const ripple = document.createElement('span');
            ripple.className = 'tab-ripple';
            const rect = tab.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px;`;
            tab.appendChild(ripple);
            ripple.addEventListener('animationend', () => ripple.remove());

            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const currentContent = document.querySelector('.admin-tab-content.active');
            const newContent = document.getElementById('tab-' + target);

            if (currentContent && currentContent !== newContent) {
                currentContent.classList.remove('active');
            }

            newContent.classList.add('active', 'tab-entering');
            newContent.addEventListener('animationend', () => {
                newContent.classList.remove('tab-entering');
            }, { once: true });

            if (target === 'videos-mgmt') loadVideosMgmt();
            if (target === 'materials-mgmt') loadMaterialsMgmt();
            if (target === 'users-mgmt') loadUsersMgmt();
        });
    });

    function openMgmtModal(id) {
        document.getElementById(id).classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    function closeMgmtModal(id) {
        document.getElementById(id).classList.remove('active');
        document.body.style.overflow = 'auto';
    }

    ['video-group', 'sub-video', 'folder-mgmt', 'file-mgmt', 'user-mgmt', 'confirm-delete'].forEach(name => {
        document.getElementById('close-modal-' + name)?.addEventListener('click', () => closeMgmtModal('modal-' + name));
        document.getElementById('backdrop-' + name)?.addEventListener('click', () => closeMgmtModal('modal-' + name));
        document.getElementById('cancel-' + name)?.addEventListener('click', () => closeMgmtModal('modal-' + name));
    });

    let _deleteCallback = null;
    function confirmDelete(message, callback) {
        document.getElementById('confirm-delete-message').textContent = message;
        _deleteCallback = callback;
        openMgmtModal('modal-confirm-delete');
    }
    document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
        if (_deleteCallback) {
            const btn = document.getElementById('confirm-delete-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Excluindo...';
            await _deleteCallback();
            _deleteCallback = null;
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-trash"></i> Excluir';
        }
        closeMgmtModal('modal-confirm-delete');
    });

    let _editingVideoId = null;
    let _editingParentId = null;
    let _vgLinkedFiles = [];
    let _svLinkedFiles = [];
    let _allFilesForPicker = [];
    let _videosMgmtData = [];
    let _materialsMgmtFiles = [];
    let _videosMgmtFilter = 'all';
    let _materialsMgmtFilter = 'all';

    function setupMgmtLevelFilter(filterId, onFilter) {
        const container = document.getElementById(filterId);
        if (!container) return;
        container.querySelectorAll('.mgmt-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.mgmt-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                onFilter(btn.dataset.level);
            });
        });
    }

    async function loadVideosMgmt() {
        const loading = document.getElementById('videos-mgmt-loading');
        const list = document.getElementById('videos-mgmt-list');
        loading.style.display = 'flex';
        list.innerHTML = '';

        const { data: videos, error: vErr } = await supabase
            .from('videos')
            .select('*, access_levels(name)')
            .order('order_index', { ascending: true });

        if (vErr) { showToast('❌ Erro ao carregar vídeos: ' + vErr.message); loading.style.display = 'none'; return; }

        loading.style.display = 'none';

        if (!videos || videos.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Nenhum vídeo cadastrado.</p></div>';
            return;
        }

        _videosMgmtData = videos;

        setupMgmtLevelFilter('videos-mgmt-filter', (level) => {
            _videosMgmtFilter = level;
            renderVideosMgmtList(list, _videosMgmtData, _videosMgmtFilter);
        });

        renderVideosMgmtList(list, videos, _videosMgmtFilter);
    }

    function renderVideosMgmtList(list, videos, filterLevel) {
        list.innerHTML = '';

        const filtered = filterLevel === 'all'
            ? videos
            : videos.filter(v => String(v.access_level_id) === String(filterLevel));

        if (!filtered.length) {
            list.innerHTML = '<div class="empty-state"><p>Nenhum vídeo para este nível.</p></div>';
            return;
        }

        const hierarchy = organizeVideoHierarchy(filtered);

        if (filterLevel === 'all') {
            const hint = document.createElement('div');
            hint.className = 'drag-hint';
            hint.innerHTML = '<i class="fa-solid fa-up-down"></i> Arraste os grupos para reordenar';
            list.appendChild(hint);
        }

        hierarchy.forEach(group => {
            const groupEl = document.createElement('div');
            groupEl.className = 'mgmt-video-group draggable-group';
            groupEl.dataset.videoId = group.main.id;
            const main = group.main;

            groupEl.innerHTML = `
                <div class="mgmt-video-group-header">
                    <div class="mgmt-video-info">
                        <span class="drag-handle" title="Arraste para reordenar"><i class="fa-solid fa-grip-vertical"></i></span>
                        <span class="mgmt-section-badge">${main.section_number || main.order_index || '—'}</span>
                        <div>
                            <strong>${main.title}</strong>
                            <small>${main.access_levels?.name || ''} · ${group.children.length} sub-vídeo(s)</small>
                        </div>
                    </div>
                    <div class="mgmt-actions">
                        <button class="btn-icon" title="Adicionar sub-vídeo" data-action="add-sub" data-id="${main.id}">
                            <i class="fa-solid fa-circle-plus"></i>
                        </button>
                        <button class="btn-icon" title="Editar" data-action="edit-video" data-id="${main.id}">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-icon btn-icon-danger" title="Excluir grupo" data-action="delete-video" data-id="${main.id}" data-title="${main.title}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>`;

            if (group.children.length > 0) {
                const subList = document.createElement('div');
                subList.className = 'mgmt-sub-list';
                group.children.forEach(child => {
                    const childEl = document.createElement('div');
                    childEl.className = 'mgmt-sub-item';
                    childEl.innerHTML = `
                        <div class="mgmt-video-info">
                            <span class="mgmt-section-badge mgmt-section-badge-sm">${child.section_number || child.order_index || '—'}</span>
                            <div><span>${child.title}</span></div>
                        </div>
                        <div class="mgmt-actions">
                            <button class="btn-icon" title="Editar" data-action="edit-video" data-id="${child.id}" data-parent="${main.id}">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="btn-icon btn-icon-danger" title="Excluir" data-action="delete-video" data-id="${child.id}" data-title="${child.title}">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>`;
                    subList.appendChild(childEl);
                });
                groupEl.appendChild(subList);
            }

            list.appendChild(groupEl);
        });

        if (filterLevel === 'all') initVideoDragAndDrop(list);

        list.querySelectorAll('[data-action="add-sub"]').forEach(btn => {
            btn.addEventListener('click', () => openSubVideoModal(null, parseInt(btn.dataset.id)));
        });
        list.querySelectorAll('[data-action="edit-video"]').forEach(btn => {
            btn.addEventListener('click', () => openEditVideoModal(parseInt(btn.dataset.id), btn.dataset.parent ? parseInt(btn.dataset.parent) : null));
        });
        list.querySelectorAll('[data-action="delete-video"]').forEach(btn => {
            btn.addEventListener('click', () => {
                confirmDelete(`Excluir "${btn.dataset.title}"? Sub-vídeos e progressos vinculados também serão removidos.`, async () => {
                    await deleteVideo(parseInt(btn.dataset.id));
                    _videosMgmtData = _videosMgmtData.filter(v => v.id !== parseInt(btn.dataset.id));
                    renderVideosMgmtList(list, _videosMgmtData, _videosMgmtFilter);
                });
            });
        });
    }

    function initVideoDragAndDrop(list) {
    if (typeof Sortable === 'undefined') { console.warn('SortableJS não carregado'); return; }

    let scrollFrame = null;
    let currentY = 0;
    const ZONE = 150;
    const SPEED = 18;

    // Atualiza Y sempre, independente de drag ativo
    document.addEventListener('mousemove', (e) => { currentY = e.clientY; });

    function startScroll() {
        if (scrollFrame) return;
        const navHeight = document.querySelector('.admin-nav')?.offsetHeight || 60;

        function step() {
            const fromTop = currentY - navHeight;
            const fromBottom = window.innerHeight - currentY;

            if (fromTop < ZONE && fromTop >= 0) {
                window.scrollBy(0, -(SPEED * (1 - fromTop / ZONE)));
            } else if (fromBottom < ZONE) {
                window.scrollBy(0, SPEED * (1 - fromBottom / ZONE));
            }
            scrollFrame = requestAnimationFrame(step);
        }
        scrollFrame = requestAnimationFrame(step);
    }

    function stopScroll() {
        cancelAnimationFrame(scrollFrame);
        scrollFrame = null;
    }

    Sortable.create(list, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'drag-over',
        dragClass: 'dragging',
        filter: '.drag-hint',
        scroll: false,
        onStart: () => startScroll(),
        onEnd: async () => {
            stopScroll();
            await saveVideoOrder(list);
        }
    });
}

    async function saveVideoOrder(list) {
        const groups = [...list.querySelectorAll('.draggable-group')];

        const updates = [];

        for (let i = 0; i < groups.length; i++) {
            const groupEl = groups[i];
            const videoId = parseInt(groupEl.dataset.videoId);
            const newOrder = i + 1;

            updates.push({
                id: videoId,
                order_index: newOrder,
                section_number: String(newOrder)
            });

            const subItems = [...groupEl.querySelectorAll('.mgmt-sub-item')];
            subItems.forEach((subEl, j) => {
                const subId = subEl.querySelector('[data-action="edit-video"]')?.dataset?.id
                    || subEl.querySelector('[data-action="delete-video"]')?.dataset?.id;
                if (!subId) return;
                updates.push({
                    id: parseInt(subId),
                    order_index: newOrder,
                    section_number: `${newOrder}.${j + 1}`
                });
            });
        }

        const btn = document.querySelector('.drag-hint');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando ordem...';

        for (const u of updates) {
            const { error } = await supabase
                .from('videos')
                .update({ order_index: u.order_index, section_number: u.section_number })
                .eq('id', u.id);

            if (error) {
                showToast('❌ Erro ao salvar ordem: ' + error.message);
                if (btn) btn.innerHTML = '<i class="fa-solid fa-up-down"></i> Arraste os grupos para reordenar';
                return;
            }
        }

        groups.forEach((groupEl, i) => {
            const newOrder = i + 1;
            groupEl.querySelector('.mgmt-section-badge').textContent = newOrder;
            const subItems = [...groupEl.querySelectorAll('.mgmt-sub-item')];
            subItems.forEach((subEl, j) => {
                const badge = subEl.querySelector('.mgmt-section-badge');
                if (badge) badge.textContent = `${newOrder}.${j + 1}`;
            });
        });

        if (btn) btn.innerHTML = '<i class="fa-solid fa-up-down"></i> Arraste os grupos para reordenar';
        showToast('✅ Ordem salva!');
    }

    async function deleteVideo(videoId) {
        const steps = [
            () => supabase.from('video_files').delete().eq('video_id', videoId),
            () => supabase.from('video_progress').delete().eq('video_id', videoId),
        ];
        const { data: subs } = await supabase.from('videos').select('id').eq('parent_video_id', videoId);
        for (const sub of (subs || [])) {
            steps.push(
                () => supabase.from('video_files').delete().eq('video_id', sub.id),
                () => supabase.from('video_progress').delete().eq('video_id', sub.id),
                () => supabase.from('videos').delete().eq('id', sub.id)
            );
        }
        steps.push(() => supabase.from('videos').delete().eq('id', videoId));

        for (const step of steps) {
            const { error } = await step();
            if (error) { showToast('❌ Erro ao excluir: ' + error.message); return; }
        }
        showToast('🗑️ Vídeo excluído.');
    }

    async function loadFilesForPicker() {
        const { data } = await supabase.from('files').select('id, name').order('name');
        _allFilesForPicker = data || [];
    }

    async function loadThumbnailPickerInline(prefix) {
        const section = document.getElementById(`${prefix}-thumbnail-section`);
        const bucketSelect = document.getElementById(`${prefix}-bucket-select`);
        const grid = document.getElementById(`${prefix}-thumb-grid`);
        const loadingEl = document.getElementById(`${prefix}-thumb-loading`);

        if (!section || !bucketSelect || !grid) return;

        const isVisible = section.style.display !== 'none' && section.style.display !== '';
        if (isVisible) { section.style.display = 'none'; return; }

        section.style.display = 'block';
        grid.innerHTML = '';
        loadingEl.style.display = 'flex';

        const bucketName = bucketSelect.value || 'thumbnail';
        await renderThumbnailGrid(prefix, bucketName);
    }

    async function renderThumbnailGrid(prefix, bucketName) {
        const grid = document.getElementById(`${prefix}-thumb-grid`);
        const loadingEl = document.getElementById(`${prefix}-thumb-loading`);
        const emptyEl = document.getElementById(`${prefix}-thumb-empty`);

        grid.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'none';
        loadingEl.style.display = 'flex';

        try {
            const { data: files, error } = await supabase.storage
                .from(bucketName)
                .list('', { limit: 200, offset: 0 });

            loadingEl.style.display = 'none';
            if (error) throw error;

            const images = (files || []).filter(f => f.name && /\.(png|jpg|jpeg|webp|gif)$/i.test(f.name));

            if (!images.length) {
                if (emptyEl) emptyEl.style.display = 'block';
                return;
            }

            images.forEach(file => {
                const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(file.name);
                const url = urlData?.publicUrl;
                if (!url) return;

                const div = document.createElement('div');
                div.className = 'thumbnail-option';
                div.title = file.name;
                div.innerHTML = `<img src="${url}" alt="${file.name}" loading="lazy">`;
                div.addEventListener('click', () => {
                    selectThumbnail(url, prefix);
                    document.getElementById(`${prefix}-thumbnail-section`).style.display = 'none';
                });
                grid.appendChild(div);
            });
        } catch (err) {
            loadingEl.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'block';
            console.error(`Erro ao listar bucket "${bucketName}":`, err);
            showToast('❌ Bucket não encontrado ou sem acesso: ' + bucketName);
        }
    }

    function selectThumbnail(url, prefix) {
        document.getElementById(`${prefix}-thumbnail`).value = url;
        const img = document.getElementById(`${prefix}-thumbnail-img`);
        const placeholder = document.getElementById(`${prefix}-thumbnail-placeholder`);
        if (img) { img.src = url; img.style.display = 'block'; }
        if (placeholder) placeholder.style.display = 'none';
    }

    function setupBucketSelectListener(prefix) {
        const sel = document.getElementById(`${prefix}-bucket-select`);
        sel?.addEventListener('change', () => renderThumbnailGrid(prefix, sel.value));
    }

    async function getVideoLinkedFiles(videoId) {
        const { data } = await supabase
            .from('video_files')
            .select('file_id, display_order, files(id, name)')
            .eq('video_id', videoId)
            .order('display_order');
        return (data || []).map(vf => ({ file_id: vf.file_id, display_order: vf.display_order, name: vf.files?.name || '' }));
    }

    function renderLinkedFilesList(containerId, linkedFiles, btnAddId) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        linkedFiles.forEach((lf, i) => {
            const row = document.createElement('div');
            row.className = 'linked-file-row';
            row.innerHTML = `
                <select class="linked-file-select" data-index="${i}">
                    <option value="">Selecione um arquivo...</option>
                    ${_allFilesForPicker.map(f => `<option value="${f.id}" ${f.id === lf.file_id ? 'selected' : ''}>${f.name}</option>`).join('')}
                </select>
                <input type="number" class="linked-file-order" data-index="${i}" value="${lf.display_order || i + 1}" min="1" style="width:70px;" placeholder="Ordem">
                <button type="button" class="btn-icon btn-icon-danger linked-file-remove" data-index="${i}">
                    <i class="fa-solid fa-xmark"></i>
                </button>`;
            container.appendChild(row);
        });

        container.querySelectorAll('.linked-file-select').forEach(sel => {
            sel.addEventListener('change', e => { linkedFiles[parseInt(e.target.dataset.index)].file_id = parseInt(e.target.value) || null; });
        });
        container.querySelectorAll('.linked-file-order').forEach(inp => {
            inp.addEventListener('change', e => { linkedFiles[parseInt(e.target.dataset.index)].display_order = parseInt(e.target.value) || 1; });
        });
        container.querySelectorAll('.linked-file-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                linkedFiles.splice(parseInt(btn.dataset.index), 1);
                renderLinkedFilesList(containerId, linkedFiles, btnAddId);
            });
        });
    }

    document.getElementById('btn-new-video-group').addEventListener('click', async () => {
        await loadFilesForPicker();
        _editingVideoId = null;
        _vgLinkedFiles = [];
        document.getElementById('modal-video-group-title').textContent = 'Novo Grupo de Vídeos';
        ['vg-title', 'vg-description', 'vg-url', 'vg-section', 'vg-order'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('vg-thumbnail').value = '';
        const vgImg = document.getElementById('vg-thumbnail-img');
        const vgPlaceholder = document.getElementById('vg-thumbnail-placeholder');
        if (vgImg) { vgImg.src = ''; vgImg.style.display = 'none'; }
        if (vgPlaceholder) vgPlaceholder.style.display = 'inline';
        const vgSection = document.getElementById('vg-thumbnail-section');
        if (vgSection) vgSection.style.display = 'none';

        document.getElementById('vg-unlocked').checked = false;
        document.getElementById('vg-access-level').value = '1';
        renderLinkedFilesList('vg-files-list', _vgLinkedFiles, 'btn-add-vg-file');
        setupBucketSelectListener('vg');
        openMgmtModal('modal-video-group');
    });

    document.getElementById('btn-add-vg-file').addEventListener('click', () => {
        _vgLinkedFiles.push({ file_id: null, display_order: _vgLinkedFiles.length + 1 });
        renderLinkedFilesList('vg-files-list', _vgLinkedFiles, 'btn-add-vg-file');
    });

    document.getElementById('btn-pick-vg-thumbnail')?.addEventListener('click', () => loadThumbnailPickerInline('vg'));

    async function openEditVideoModal(videoId, parentId = null) {
        await loadFilesForPicker();
        _editingVideoId = videoId;
        _editingParentId = parentId;

        const { data: video } = await supabase.from('videos').select('*').eq('id', videoId).single();
        if (!video) return;

        const isGroup = !parentId;
        const prefix = isGroup ? 'vg' : 'sv';
        const modalId = isGroup ? 'modal-video-group' : 'modal-sub-video';

        document.getElementById(isGroup ? 'modal-video-group-title' : 'modal-sub-video-title').textContent = 'Editar Vídeo';
        document.getElementById(`${prefix}-title`).value = video.title || '';
        document.getElementById(`${prefix}-description`).value = video.description || '';
        document.getElementById(`${prefix}-url`).value = video.video_url || '';

        const thumbUrl = video.thumbnail_url || '';
        document.getElementById(`${prefix}-thumbnail`).value = thumbUrl;
        const thumbImg = document.getElementById(`${prefix}-thumbnail-img`);
        const thumbPlaceholder = document.getElementById(`${prefix}-thumbnail-placeholder`);
        if (thumbImg) { thumbImg.src = thumbUrl; thumbImg.style.display = thumbUrl ? 'block' : 'none'; }
        if (thumbPlaceholder) thumbPlaceholder.style.display = thumbUrl ? 'none' : 'inline';

        const thumbSection = document.getElementById(`${prefix}-thumbnail-section`);
        if (thumbSection) thumbSection.style.display = 'none';

        document.getElementById(`${prefix}-section`).value = video.section_number || '';
        document.getElementById(`${prefix}-order`).value = video.order_index ?? '';
        document.getElementById(`${prefix}-unlocked`).checked = !!video.unlocked;
        if (isGroup) document.getElementById('vg-access-level').value = video.access_level_id || '1';

        const linked = await getVideoLinkedFiles(videoId);
        if (isGroup) {
            _vgLinkedFiles = linked;
            renderLinkedFilesList('vg-files-list', _vgLinkedFiles, 'btn-add-vg-file');
        } else {
            _svLinkedFiles = linked;
            renderLinkedFilesList('sv-files-list', _svLinkedFiles, 'btn-add-sv-file');
        }

        setupBucketSelectListener(prefix);
        openMgmtModal(modalId);
    }

    async function saveVideoData(prefix, isGroup, parentId = null) {
        const title = document.getElementById(`${prefix}-title`).value.trim();
        const url = document.getElementById(`${prefix}-url`).value.trim();
        if (!title || !url) { showToast('⚠️ Título e URL são obrigatórios.'); return false; }

        const thumbEl = document.getElementById(`${prefix}-thumbnail`);
        const thumbnailUrl = thumbEl ? (thumbEl.value.trim() || null) : null;

        const payload = {
            title,
            description: document.getElementById(`${prefix}-description`).value.trim() || null,
            video_url: url,
            thumbnail_url: thumbnailUrl,
            section_number: document.getElementById(`${prefix}-section`).value.trim() || null,
            order_index: parseInt(document.getElementById(`${prefix}-order`).value) || 0,
            unlocked: document.getElementById(`${prefix}-unlocked`).checked,
        };

        if (isGroup) {
            payload.access_level_id = parseInt(document.getElementById('vg-access-level').value);
            payload.parent_video_id = null;
        } else {
            payload.parent_video_id = parseInt(parentId);
            const { data: parent } = await supabase.from('videos').select('access_level_id').eq('id', parseInt(parentId)).single();
            payload.access_level_id = parent?.access_level_id || 1;
        }

        let videoId = _editingVideoId;
        try {
            if (videoId) {
                const { error } = await supabase.from('videos').update(payload).eq('id', videoId);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from('videos').insert(payload).select('id').single();
                if (error) throw error;
                videoId = data.id;
            }
        } catch (err) {
            showToast('❌ Erro ao salvar vídeo: ' + (err.message || 'Verifique as permissões no Supabase.'));
            console.error('saveVideoData error:', err);
            return false;
        }

        await supabase.from('video_files').delete().eq('video_id', videoId);
        const linkedFiles = isGroup ? _vgLinkedFiles : _svLinkedFiles;
        const validFiles = linkedFiles.filter(lf => lf.file_id && parseInt(lf.file_id) > 0);
        if (validFiles.length > 0) {
            const { error: vfError } = await supabase.from('video_files').insert(
                validFiles.map((lf, idx) => ({ video_id: videoId, file_id: parseInt(lf.file_id), display_order: lf.display_order || (idx + 1) }))
            );
            if (vfError) { showToast('⚠️ Vídeo salvo, mas erro ao vincular arquivos: ' + vfError.message); return true; }
        }

        showToast('✅ Vídeo salvo!');
        return true;
    }

    document.getElementById('save-video-group').addEventListener('click', async () => {
        const btn = document.getElementById('save-video-group');
        btn.disabled = true;
        const ok = await saveVideoData('vg', true);
        btn.disabled = false;
        if (ok) { closeMgmtModal('modal-video-group'); loadVideosMgmt(); }
    });

    async function openSubVideoModal(videoId, parentId) {
        await loadFilesForPicker();
        _editingVideoId = videoId;
        _editingParentId = parentId;
        _svLinkedFiles = videoId ? await getVideoLinkedFiles(videoId) : [];

        document.getElementById('modal-sub-video-title').textContent = videoId ? 'Editar Sub-Vídeo' : 'Novo Sub-Vídeo';
        ['sv-title', 'sv-description', 'sv-url', 'sv-section', 'sv-order'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('sv-thumbnail').value = '';
        const svImg = document.getElementById('sv-thumbnail-img');
        const svPlaceholder = document.getElementById('sv-thumbnail-placeholder');
        if (svImg) { svImg.src = ''; svImg.style.display = 'none'; }
        if (svPlaceholder) svPlaceholder.style.display = 'inline';
        const svSection = document.getElementById('sv-thumbnail-section');
        if (svSection) svSection.style.display = 'none';

        document.getElementById('sv-unlocked').checked = false;

        if (videoId) {
            const { data: v } = await supabase.from('videos').select('*').eq('id', videoId).single();
            if (v) {
                document.getElementById('sv-title').value = v.title || '';
                document.getElementById('sv-description').value = v.description || '';
                document.getElementById('sv-url').value = v.video_url || '';
                const svThumbUrl = v.thumbnail_url || '';
                document.getElementById('sv-thumbnail').value = svThumbUrl;
                if (svImg) { svImg.src = svThumbUrl; svImg.style.display = svThumbUrl ? 'block' : 'none'; }
                if (svPlaceholder) svPlaceholder.style.display = svThumbUrl ? 'none' : 'inline';
                document.getElementById('sv-section').value = v.section_number || '';
                document.getElementById('sv-order').value = v.order_index ?? '';
                document.getElementById('sv-unlocked').checked = !!v.unlocked;
            }
        }
        renderLinkedFilesList('sv-files-list', _svLinkedFiles, 'btn-add-sv-file');
        setupBucketSelectListener('sv');
        openMgmtModal('modal-sub-video');
    }

    document.getElementById('btn-add-sv-file').addEventListener('click', () => {
        _svLinkedFiles.push({ file_id: null, display_order: _svLinkedFiles.length + 1 });
        renderLinkedFilesList('sv-files-list', _svLinkedFiles, 'btn-add-sv-file');
    });

    document.getElementById('btn-pick-sv-thumbnail')?.addEventListener('click', () => loadThumbnailPickerInline('sv'));

    document.getElementById('save-sub-video').addEventListener('click', async () => {
        const btn = document.getElementById('save-sub-video');
        btn.disabled = true;
        const ok = await saveVideoData('sv', false, _editingParentId);
        btn.disabled = false;
        if (ok) { closeMgmtModal('modal-sub-video'); loadVideosMgmt(); }
    });

    let _editingFolderId = null;
    let _editingFileId = null;
    let _allFoldersMgmt = [];

    async function loadMaterialsMgmt() {
        const loading = document.getElementById('materials-mgmt-loading');
        const list = document.getElementById('materials-mgmt-list');
        loading.style.display = 'flex';
        list.innerHTML = '';

        const [foldersRes, filesRes] = await Promise.all([
            supabase.from('folders').select('*, access_levels(name)').order('order_index', { ascending: true }),
            supabase.from('files').select('*, access_levels(name), folders(name)').order('order_files', { ascending: true, nullsFirst: false })
        ]);

        _allFoldersMgmt = foldersRes.data || [];
        _materialsMgmtFiles = filesRes.data || [];
        loading.style.display = 'none';

        if (!_allFoldersMgmt.length && !_materialsMgmtFiles.length) {
            list.innerHTML = '<div class="empty-state"><p>Nenhum material cadastrado.</p></div>';
            return;
        }

        setupMgmtLevelFilter('materials-mgmt-filter', (level) => {
            _materialsMgmtFilter = level;
            renderMaterialsMgmtList(list, _allFoldersMgmt, _materialsMgmtFiles, _materialsMgmtFilter);
        });

        renderMaterialsMgmtList(list, _allFoldersMgmt, _materialsMgmtFiles, _materialsMgmtFilter);
    }

    function renderMaterialsMgmtList(list, folders, files, filterLevel) {
    list.innerHTML = '';

    const filteredFolders = filterLevel === 'all'
        ? folders
        : folders.filter(f => String(f.access_level_id) === String(filterLevel));

    const filteredStandalone = filterLevel === 'all'
        ? files.filter(f => !f.folder_id)
        : files.filter(f => !f.folder_id && String(f.access_level_id) === String(filterLevel));

    if (!filteredFolders.length && !filteredStandalone.length) {
        list.innerHTML = '<div class="empty-state"><p>Nenhum material para este nível.</p></div>';
        return;
    }

    const foldersContainer = document.createElement('div');
    foldersContainer.id = 'folders-sortable';

    filteredFolders.forEach(folder => {
        const folderFiles = files.filter(f => f.folder_id === folder.id);
        const el = document.createElement('div');
        el.className = 'mgmt-video-group draggable-folder';
        el.dataset.folderId = folder.id;
        el.innerHTML = `
            <div class="mgmt-video-group-header">
                <span class="drag-handle" title="Arraste para reordenar"><i class="fa-solid fa-grip-vertical"></i></span>
                <div class="mgmt-video-info">
                    <i class="fa-solid fa-folder" style="color: var(--primary); font-size: 1.2rem; flex-shrink:0;"></i>
                    <div>
                        <strong>${folder.name}</strong>
                        <small>${folder.access_levels?.name || ''} · ${folderFiles.length} arquivo(s)</small>
                    </div>
                </div>
                <div class="mgmt-actions">
                    <button class="btn-icon" title="Adicionar arquivo" data-action="add-file-to-folder" data-folder-id="${folder.id}">
                        <i class="fa-solid fa-file-circle-plus"></i>
                    </button>
                    <button class="btn-icon" title="Editar" data-action="edit-folder" data-id="${folder.id}">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-icon btn-icon-danger" title="Excluir" data-action="delete-folder" data-id="${folder.id}" data-name="${folder.name}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>`;

        if (folderFiles.length > 0) {
            const subList = document.createElement('div');
            subList.className = 'mgmt-sub-list';
            folderFiles.forEach(file => {
                const fileEl = document.createElement('div');
                fileEl.className = 'mgmt-sub-item';
                fileEl.innerHTML = `
                    <div class="mgmt-video-info">
                        <div>${getFileIcon(file.name)}</div>
                        <span>${file.name}</span>
                    </div>
                    <div class="mgmt-actions">
                        <button class="btn-icon" title="Editar" data-action="edit-file" data-id="${file.id}"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-icon btn-icon-danger" title="Excluir" data-action="delete-file" data-id="${file.id}" data-name="${file.name}"><i class="fa-solid fa-trash"></i></button>
                    </div>`;
                subList.appendChild(fileEl);
            });
            el.appendChild(subList);
        }
        foldersContainer.appendChild(el);
    });

    list.appendChild(foldersContainer);

    if (filteredStandalone.length > 0) {
        const section = document.createElement('div');
        section.innerHTML = `<div class="mgmt-section-label"><i class="fa-solid fa-file"></i> Arquivos Avulsos</div>`;
        list.appendChild(section);

        const standaloneContainer = document.createElement('div');
        standaloneContainer.id = 'standalone-sortable';

        filteredStandalone.forEach(file => {
            const el = document.createElement('div');
            el.className = 'mgmt-video-group draggable-file';
            el.dataset.fileId = file.id;
            el.innerHTML = `
                <div class="mgmt-video-group-header">
                    <span class="drag-handle" title="Arraste para reordenar"><i class="fa-solid fa-grip-vertical"></i></span>
                    <div class="mgmt-video-info">
                        <div>${getFileIcon(file.name)}</div>
                        <div>
                            <strong>${file.name}</strong>
                            <small>${file.access_levels?.name || ''}</small>
                        </div>
                    </div>
                    <div class="mgmt-actions">
                        <button class="btn-icon" title="Editar" data-action="edit-file" data-id="${file.id}"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-icon btn-icon-danger" title="Excluir" data-action="delete-file" data-id="${file.id}" data-name="${file.name}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>`;
            standaloneContainer.appendChild(el);
        });

        list.appendChild(standaloneContainer);

        if (typeof Sortable !== 'undefined') {
            let scrollFrame = null;
            let currentY = 0;
            document.addEventListener('mousemove', (e) => { currentY = e.clientY; });

            Sortable.create(standaloneContainer, {
                animation: 150,
                handle: '.drag-handle',
                draggable: '.draggable-file',
                ghostClass: 'drag-over',
                dragClass: 'dragging',
                scroll: false,
                onStart: () => {
                    if (scrollFrame) return;
                    const navHeight = document.querySelector('.admin-top-nav')?.offsetHeight || 60;
                    const ZONE = 150, SPEED = 18;
                    const step = () => {
                        const fromTop = currentY - navHeight;
                        const fromBottom = window.innerHeight - currentY;
                        if (fromTop < ZONE && fromTop >= 0) window.scrollBy(0, -(SPEED * (1 - fromTop / ZONE)));
                        else if (fromBottom < ZONE) window.scrollBy(0, SPEED * (1 - fromBottom / ZONE));
                        scrollFrame = requestAnimationFrame(step);
                    };
                    scrollFrame = requestAnimationFrame(step);
                },
                onEnd: async () => {
                    cancelAnimationFrame(scrollFrame);
                    scrollFrame = null;
                    const items = [...standaloneContainer.querySelectorAll('.draggable-file')];
                    for (let i = 0; i < items.length; i++) {
                        await supabase.from('files').update({ order_files: i + 1 }).eq('id', items[i].dataset.fileId);
                    }
                    showToast('✅ Ordem salva!');
                }
            });
        }
    }

    if (typeof Sortable !== 'undefined') {
        let scrollFrame = null;
        let currentY = 0;
        document.addEventListener('mousemove', (e) => { currentY = e.clientY; });

        Sortable.create(foldersContainer, {
            animation: 150,
            handle: '.drag-handle',
            draggable: '.draggable-folder',
            ghostClass: 'drag-over',
            dragClass: 'dragging',
            scroll: false,
            onStart: () => {
                if (scrollFrame) return;
                const navHeight = document.querySelector('.admin-top-nav')?.offsetHeight || 60;
                const ZONE = 150, SPEED = 18;
                const step = () => {
                    const fromTop = currentY - navHeight;
                    const fromBottom = window.innerHeight - currentY;
                    if (fromTop < ZONE && fromTop >= 0) window.scrollBy(0, -(SPEED * (1 - fromTop / ZONE)));
                    else if (fromBottom < ZONE) window.scrollBy(0, SPEED * (1 - fromBottom / ZONE));
                    scrollFrame = requestAnimationFrame(step);
                };
                scrollFrame = requestAnimationFrame(step);
            },
            onEnd: async () => {
                cancelAnimationFrame(scrollFrame);
                scrollFrame = null;
                const items = [...foldersContainer.querySelectorAll('.draggable-folder')];
                for (let i = 0; i < items.length; i++) {
                    await supabase.from('folders').update({ order_index: i + 1 }).eq('id', items[i].dataset.folderId);
                }
                showToast('✅ Ordem salva!');
            }
        });
    }

    list.querySelectorAll('[data-action="edit-folder"]').forEach(btn => {
        btn.addEventListener('click', () => openFolderMgmtModal(btn.dataset.id));
    });
    list.querySelectorAll('[data-action="delete-folder"]').forEach(btn => {
        btn.addEventListener('click', () => {
            confirmDelete(`Excluir pasta "${btn.dataset.name}"? Os arquivos dentro serão desvinculados (não excluídos).`, async () => {
                await supabase.from('files').update({ folder_id: null }).eq('folder_id', btn.dataset.id);
                await supabase.from('folders').delete().eq('id', btn.dataset.id);
                showToast('🗑️ Pasta excluída.'); loadMaterialsMgmt();
            });
        });
    });
    list.querySelectorAll('[data-action="add-file-to-folder"]').forEach(btn => {
        btn.addEventListener('click', () => openFileMgmtModal(null, btn.dataset.folderId));
    });
    list.querySelectorAll('[data-action="edit-file"]').forEach(btn => {
        btn.addEventListener('click', () => openFileMgmtModal(parseInt(btn.dataset.id)));
    });
    list.querySelectorAll('[data-action="delete-file"]').forEach(btn => {
        btn.addEventListener('click', () => {
            confirmDelete(`Excluir arquivo "${btn.dataset.name}"?`, async () => {
                await supabase.from('video_files').delete().eq('file_id', btn.dataset.id);
                await supabase.from('files').delete().eq('id', btn.dataset.id);
                showToast('🗑️ Arquivo excluído.'); loadMaterialsMgmt();
            });
        });
    });
}

    document.getElementById('btn-new-folder').addEventListener('click', () => openFolderMgmtModal(null));

    async function openFolderMgmtModal(folderId) {
        _editingFolderId = folderId;
        document.getElementById('modal-folder-mgmt-title').textContent = folderId ? 'Editar Pasta' : 'Nova Pasta';
        document.getElementById('fm-name').value = '';
        document.getElementById('fm-description').value = '';
        document.getElementById('fm-access-level').value = '1';
        if (folderId) {
            const { data } = await supabase.from('folders').select('*').eq('id', folderId).single();
            if (data) {
                document.getElementById('fm-name').value = data.name || '';
                document.getElementById('fm-description').value = data.description || '';
                document.getElementById('fm-access-level').value = data.access_level_id || '1';
            }
        }
        openMgmtModal('modal-folder-mgmt');
    }

    document.getElementById('save-folder-mgmt').addEventListener('click', async () => {
        const name = document.getElementById('fm-name').value.trim();
        if (!name) { showToast('⚠️ Nome é obrigatório.'); return; }
        const payload = {
            name,
            description: document.getElementById('fm-description').value.trim() || null,
            access_level_id: parseInt(document.getElementById('fm-access-level').value)
        };
        const btn = document.getElementById('save-folder-mgmt');
        btn.disabled = true;
        if (_editingFolderId) {
            await supabase.from('folders').update(payload).eq('id', _editingFolderId);
        } else {
            await supabase.from('folders').insert(payload);
        }
        btn.disabled = false;
        showToast('✅ Pasta salva!');
        closeMgmtModal('modal-folder-mgmt');
        loadMaterialsMgmt();
    });

    document.getElementById('btn-new-standalone-file').addEventListener('click', () => openFileMgmtModal(null, null));

    async function openFileMgmtModal(fileId, presetFolderId = null) {
        _editingFileId = fileId;
        document.getElementById('modal-file-mgmt-title').textContent = fileId ? 'Editar Arquivo' : 'Novo Arquivo';
        ['file-mgmt-name', 'file-mgmt-description', 'file-mgmt-url', 'file-mgmt-order'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('file-mgmt-access-level').value = '1';
        document.getElementById('file-mgmt-show').checked = true;

        const folderSel = document.getElementById('file-mgmt-folder');
        folderSel.innerHTML = '<option value="">Nenhuma (arquivo avulso)</option>';
        _allFoldersMgmt.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.name;
            folderSel.appendChild(opt);
        });
        if (presetFolderId) folderSel.value = presetFolderId;

        if (fileId) {
            const { data } = await supabase.from('files').select('*').eq('id', fileId).single();
            if (data) {
                document.getElementById('file-mgmt-name').value = data.name || '';
                document.getElementById('file-mgmt-description').value = data.description || '';
                document.getElementById('file-mgmt-url').value = data.file_url || '';
                document.getElementById('file-mgmt-access-level').value = data.access_level_id || '1';
                document.getElementById('file-mgmt-order').value = data.order_files ?? '';
                document.getElementById('file-mgmt-show').checked = data.show_in_materials !== false;
                folderSel.value = data.folder_id || '';
            }
        }
        openMgmtModal('modal-file-mgmt');
    }

    document.getElementById('save-file-mgmt').addEventListener('click', async () => {
        const name = document.getElementById('file-mgmt-name').value.trim();
        const url = document.getElementById('file-mgmt-url').value.trim();
        if (!name || !url) { showToast('⚠️ Nome e URL são obrigatórios.'); return; }
        const payload = {
            name,
            description: document.getElementById('file-mgmt-description').value.trim() || null,
            file_url: url,
            access_level_id: parseInt(document.getElementById('file-mgmt-access-level').value),
            folder_id: document.getElementById('file-mgmt-folder').value || null,
            order_files: parseInt(document.getElementById('file-mgmt-order').value) || null,
            show_in_materials: document.getElementById('file-mgmt-show').checked
        };
        const btn = document.getElementById('save-file-mgmt');
        btn.disabled = true;
        if (_editingFileId) {
            await supabase.from('files').update(payload).eq('id', _editingFileId);
        } else {
            await supabase.from('files').insert(payload);
        }
        btn.disabled = false;
        showToast('✅ Arquivo salvo!');
        closeMgmtModal('modal-file-mgmt');
        loadMaterialsMgmt();
    });

    let _editingUserId = null;

    async function loadUsersMgmt() {
        const loading = document.getElementById('users-mgmt-loading');
        const list = document.getElementById('users-mgmt-list');
        loading.style.display = 'flex';
        list.innerHTML = '';

        const [usersRes, accessRes] = await Promise.all([
            supabase.from('users').select('*').order('full_name'),
            supabase.from('user_access').select('user_id, access_level_id, access_levels(name)')
        ]);

        const users = usersRes.data || [];
        const accessMap = {};
        (accessRes.data || []).forEach(a => { accessMap[a.user_id] = a; });

        loading.style.display = 'none';

        if (!users.length) { list.innerHTML = '<div class="empty-state"><p>Nenhum usuário cadastrado.</p></div>'; return; }

        const levelColors = { 1: 'level-psicologos', 2: 'level-admin', 3: 'level-dev' };

        users.forEach(user => {
            const acc = accessMap[user.id];
            const levelName = acc?.access_levels?.name || 'Sem acesso';
            const levelId = acc?.access_level_id || 0;
            const displayName = user.full_name || user.name || 'Sem nome';

            const el = document.createElement('div');
            el.className = 'mgmt-user-row';
            el.innerHTML = `
                <div class="mgmt-user-avatar">${displayName.charAt(0).toUpperCase()}</div>
                <div class="mgmt-user-info">
                    <strong>${displayName}</strong>
                    <small>${user.name || ''}</small>
                </div>
                <span class="user-level-badge ${levelColors[levelId] || ''}">${levelName}</span>
                <div class="mgmt-actions">
                    <button class="btn-icon" title="Editar" data-action="edit-user" data-id="${user.id}"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-icon btn-icon-danger" title="Excluir" data-action="delete-user" data-id="${user.id}" data-name="${displayName}"><i class="fa-solid fa-trash"></i></button>
                </div>`;
            list.appendChild(el);
        });

        list.querySelectorAll('[data-action="edit-user"]').forEach(btn => {
            btn.addEventListener('click', () => openUserMgmtModal(btn.dataset.id));
        });
        list.querySelectorAll('[data-action="delete-user"]').forEach(btn => {
            btn.addEventListener('click', () => {
                confirmDelete(`Excluir usuário "${btn.dataset.name}"? Progressos e acessos serão removidos.\n⚠️ A conta de autenticação deve ser removida manualmente no painel Supabase > Authentication.`, async () => {
                    const uid = btn.dataset.id;
                    try {
                        await supabase.from('video_progress').delete().eq('user_id', uid);
                        await supabase.from('user_activity_logs').delete().eq('user_id', uid);
                        await supabase.from('user_access').delete().eq('user_id', uid);
                        const { error } = await supabase.from('users').delete().eq('id', uid);
                        if (error) throw error;
                        showToast('🗑️ Usuário removido dos registros. Remova a conta auth no painel Supabase.');
                    } catch (err) {
                        showToast('❌ Erro ao excluir: ' + err.message);
                    }
                    loadUsersMgmt();
                });
            });
        });

        const searchInput = document.getElementById('users-mgmt-search');
        const clearBtn = document.getElementById('clear-users-search');

        if (searchInput) {
            searchInput.value = '';
            searchInput.oninput = () => {
                const term = searchInput.value.toLowerCase().trim();
                clearBtn.style.display = term ? 'flex' : 'none';
                list.querySelectorAll('.mgmt-user-row').forEach(row => {
                    const name = row.querySelector('strong').textContent.toLowerCase();
                    row.style.display = name.includes(term) ? '' : 'none';
                });
            };

            clearBtn.onclick = () => {
                searchInput.value = '';
                clearBtn.style.display = 'none';
                list.querySelectorAll('.mgmt-user-row').forEach(row => row.style.display = '');
            };
        }
    }

    document.getElementById('btn-new-user').addEventListener('click', () => openUserMgmtModal(null));

    
    async function openUserMgmtModal(userId) {
        _editingUserId = userId;
        document.getElementById('modal-user-mgmt-title').textContent = userId ? 'Editar Usuário' : 'Novo Usuário';
        ['user-mgmt-fullname', 'user-mgmt-name', 'user-mgmt-email', 'user-mgmt-password'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('user-mgmt-access-level').value = '1';

        const emailGroup = document.getElementById('user-email-group');
        const pwHint = document.getElementById('user-password-hint');
        const pwLabel = document.getElementById('user-password-label');

        if (userId) {
            emailGroup.style.display = 'none';
            pwHint.style.display = 'block';
            pwLabel.textContent = 'Nova Senha (opcional)';
            const [userRes, accessRes] = await Promise.all([
                supabase.from('users').select('*').eq('id', userId).single(),
                supabase.from('user_access').select('access_level_id').eq('user_id', userId).maybeSingle()
            ]);
            if (userRes.data) {
                document.getElementById('user-mgmt-fullname').value = userRes.data.full_name || '';
                document.getElementById('user-mgmt-name').value = userRes.data.name || '';
            }
            if (accessRes.data) document.getElementById('user-mgmt-access-level').value = accessRes.data.access_level_id;
        } else {
            emailGroup.style.display = 'block';
            pwHint.style.display = 'none';
            pwLabel.textContent = 'Senha *';
        }
        openMgmtModal('modal-user-mgmt');
    }

    document.getElementById('save-user-mgmt').addEventListener('click', async () => {
        const btn = document.getElementById('save-user-mgmt');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';

        const fullName = document.getElementById('user-mgmt-fullname').value.trim();
        const name = document.getElementById('user-mgmt-name').value.trim();
        const accessLevel = parseInt(document.getElementById('user-mgmt-access-level').value);

        if (!fullName) {
            showToast('⚠️ Nome completo é obrigatório.');
            btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar';
            return;
        }

        try {
            if (_editingUserId) {
                const { error: userErr } = await supabase.from('users').update({
                    full_name: fullName,
                    name: name || fullName.split(' ')[0],
                }).eq('id', _editingUserId);
                if (userErr) throw userErr;

                const { data: existAccess } = await supabase.from('user_access').select('id').eq('user_id', _editingUserId).maybeSingle();
                if (existAccess) {
                    const { error: accErr } = await supabase.from('user_access').update({ access_level_id: accessLevel }).eq('user_id', _editingUserId);
                    if (accErr) throw accErr;
                } else {
                    const { error: accErr } = await supabase.from('user_access').insert({ user_id: _editingUserId, access_level_id: accessLevel });
                    if (accErr) throw accErr;
                }
                showToast('✅ Usuário atualizado!');

            } else {

                const email = document.getElementById('user-mgmt-email').value.trim();
                const password = document.getElementById('user-mgmt-password').value;

                if (!email || !password) { showToast('⚠️ Email e senha são obrigatórios.'); throw new Error('validation'); }
                if (password.length < 6) { showToast('⚠️ Senha mínimo 6 caracteres.'); throw new Error('validation'); }
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('⚠️ Email inválido.'); throw new Error('validation'); }

                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: { full_name: fullName, name: name || fullName.split(' ')[0] }
                    }
                });

                if (authError) throw authError;

                if (!authData?.user?.id) {
                    throw new Error('Não foi possível criar o usuário. Verifique se o email já está cadastrado.');
                }

                const newId = authData.user.id;
                const isActive = !!authData.session;

                const { error: insertErr } = await supabase.from('users').upsert({
                    id: newId,
                    full_name: fullName,
                    name: name || fullName.split(' ')[0]
                }, { onConflict: 'id' });
                if (insertErr) throw insertErr;

                const { error: accessErr } = await supabase.from('user_access').insert({ user_id: newId, access_level_id: accessLevel });
                if (accessErr) throw accessErr;

                if (isActive) {
                    showToast('✅ Usuário criado e já pode fazer login!');
                } else {
                    showToast('⚠️ Usuário criado, mas precisa confirmar o email.\n\nPara desativar isso: Supabase > Authentication > Providers > Email > desmarque "Confirm email".');
                }
            }

            closeMgmtModal('modal-user-mgmt');
            loadUsersMgmt();

        } catch (err) {
            if (err.message !== 'validation') {
                console.error('Erro ao salvar usuário:', err);
                showToast('❌ ' + (err.message || 'Erro desconhecido. Verifique o console.'));
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar';
        }
    });

    const style = document.createElement('style');
    style.textContent = `
    @keyframes slideInUp {
        from { transform: translateY(100px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }
    @keyframes slideOutDown {
        from { transform: translateY(0); opacity: 1; }
        to { transform: translateY(100px); opacity: 0; }
    }
    `;
    document.head.appendChild(style);

})();