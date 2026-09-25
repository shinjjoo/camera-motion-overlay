# Camera 프로젝트

이 저장소는 **Camera** 프로젝트를 위한 Git 저장소입니다.  
**Git Worktree**를 활용하여 여러 브랜치를 동시에 별도의 작업 디렉토리에서 효율적으로 관리할 수 있도록 구성되어 있습니다.

---

## 🛠 Git Worktree 주요 명령어 가이드

Git Worktree를 사용하면 브랜치를 전환할 때마다 기존 작업을 숨기거나 치울 필요 없이, 새 디렉토리에서 독립적으로 작업할 수 있습니다.

### 1. 새 워크트리(Worktree) 및 브랜치 추가
새로운 기능을 개발할 때, 상위 디렉토리에 새로운 폴더를 만들면서 동시에 새 브랜치를 연결합니다.
```bash
# 형식: git worktree add <새 폴더 경로> -b <새 브랜치 이름>
# 예시: 'Camera-feature' 폴더를 만들고 'feature' 브랜치 연결
git worktree add ../Camera-feature -b feature
```

### 2. 현재 연결된 워크트리 목록 확인
어떤 디렉토리가 어떤 브랜치와 연결되어 있는지 확인합니다.
```bash
git worktree list
```

### 3. 워크트리 작업 완료 후 삭제
특정 워크트리에서의 작업이 끝나고 머지(Merge)되었거나 더 이상 필요하지 않을 때 안전하게 워크트리 연결을 해제합니다.
```bash
# 형식: git worktree remove <워크트리 폴더 경로>
# 예시:
git worktree remove ../Camera-feature
```

---

## 🔒 보안 및 안전 수칙
- 개인정보, API 키, 비밀번호 등의 민감한 정보는 소스코드에 직접 작성하지 않고 `.env` 파일 등에 안전하게 보관합니다.
- `.env` 파일은 `.gitignore`에 등록되어 원격 저장소에 업로드되지 않도록 보호됩니다.
