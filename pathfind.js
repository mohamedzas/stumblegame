'use strict'; {
    const PF_CLEAR = 0;
    const PF_OBSTACLE_MAX = Math.pow(2, 26);
    const PF_OBSTACLE = PF_OBSTACLE_MAX - 1;

    function XYToKey(x, y) {
        return x * PF_OBSTACLE_MAX + y
    }
    const pathfinderMap = new Map;

    function GetPathfinder(mapKey) {
        let ret = pathfinderMap.get(mapKey);
        if (!ret) {
            ret = new Pathfinder;
            pathfinderMap.set(mapKey, ret)
        }
        return ret
    }
    self.JobHandlers["PFCellData"] = function(params) {
        const mapKey = params["mapKey"];
        const hcells = params["hcells"];
        const vcells = params["vcells"];
        const cellData = params["cellData"];
        const diagonals =
            params["diagonals"];
        const pathfinder = GetPathfinder(mapKey);
        pathfinder.Init(hcells, vcells, cellData, diagonals)
    };
    self.JobHandlers["PFUpdateRegion"] = function(params) {
        const mapKey = params["mapKey"];
        const cx1 = params["cx1"];
        const cy1 = params["cy1"];
        const lenx = params["lenx"];
        const leny = params["leny"];
        const cellData = params["cellData"];
        const pathfinder = GetPathfinder(mapKey);
        pathfinder.UpdateRegion(cx1, cy1, lenx, leny, cellData)
    };
    self.JobHandlers["PFSetDiagonals"] = function(params) {
        const mapKey = params["mapKey"];
        const diagonals =
            params["diagonals"];
        const pathfinder = GetPathfinder(mapKey);
        pathfinder.SetDiagonalsEnabled(diagonals)
    };
    self.JobHandlers["PFResetAllCellData"] = function(params) {
        for (const pathfinder of pathfinderMap.values()) pathfinder.Clear()
    };
    self.JobHandlers["PFFindPath"] = function(params) {
        const mapKey = params["mapKey"];
        const cellX = params["cellX"];
        const cellY = params["cellY"];
        const destCellX = params["destCellX"];
        const destCellY = params["destCellY"];
        const pathfinder = GetPathfinder(mapKey);
        const t = performance.now();
        const result =
            pathfinder.FindPath(cellX, cellY, destCellX, destCellY);
        return {
            result
        }
    };
    let nodeSequence = 0;
    class Node {
        constructor(x, y) {
            this._parent = null;
            this._x = x || 0;
            this._y = y || 0;
            this._f = 0;
            this._g = 0;
            this._h = 0;
            this._seq = nodeSequence++
        }
        SetXY(x, y) {
            this._x = x;
            this._y = y
        }
        DirectionTo(b) {
            const ax = this._x;
            const ay = this._y;
            const bx = b._x;
            const by = b._y;
            if (ax === bx) {
                if (by > ay) return 6;
                if (by < ay) return 2;
                if (ay === by) return 8
            } else if (ay === by) {
                if (bx > ax) return 4;
                if (by < ax) return 0
            } else {
                if (bx < ax && by < ay) return 1;
                if (bx > ax && by < ay) return 3;
                if (bx <
                    ax && by > ay) return 7;
                if (bx > ax && by > ay) return 5
            }
            return 8
        }
        static Sort(a, b) {
            const af = a._f;
            const bf = b._f;
            if (af !== bf) return af - bf;
            return a._seq - b._seq
        }
    }
    class Pathfinder {
        constructor() {
            this._hcells = 0;
            this._vcells = 0;
            this._cells = null;
            this._openList = new self.RedBlackSet(Node.Sort);
            this._openMap = new Map;
            this._closedSet = new Set;
            this._currentNode = null;
            this._targetX = 0;
            this._targetY = 0;
            this._diagonalsEnabled = true
        }
        Init(hcells, vcells, data, diagonalsEnabled) {
            this._hcells = hcells;
            this._vcells = vcells;
            this._cells = data;
            this._diagonalsEnabled = !!diagonalsEnabled
        }
        UpdateRegion(cx1, cy1, lenx, leny, cellData) {
            const cells = this._cells;
            if (!cells) return;
            for (let x = 0; x < lenx; ++x) cells[cx1 + x].set(cellData[x], cy1)
        }
        Clear() {
            this._cells = null
        }
        _ClearIntermediateData() {
            this._openList.Clear();
            this._openMap.clear();
            this._closedSet.clear();
            this._currentNode = null;
            nodeSequence = 0
        }
        UpdateRegion(cx, cy, lenx, leny, data) {
            for (let x = 0; x < lenx; ++x)
                for (let y = 0; y < leny; ++y) this._cells[cx + x][cy + y] = data[x][y]
        }
        SetDiagonalsEnabled(d) {
            this._diagonalsEnabled = !!d
        }
        At(x, y) {
            if (x < 0 || y < 0 ||
                x >= this._hcells || y >= this._vcells) return PF_OBSTACLE;
            return this._cells[x][y]
        }
        FindPath(startX, startY, endX, endY) {
            if (!this._cells) return null;
            startX = Math.floor(startX);
            startY = Math.floor(startY);
            endX = Math.floor(endX);
            endY = Math.floor(endY);
            this._targetX = endX;
            this._targetY = endY;
            const minX = Math.min(startX, endX);
            const maxX = Math.max(startX, endX);
            const minY = Math.min(startY, endY);
            const maxY = Math.max(startY, endY);
            if (minX < 0 || minY < 0 || maxX >= this._hcells || maxY >= this._vcells) return null;
            if (this._diagonalsEnabled) {
                let canMoveDirect =
                    true;
                for (let x = minX; x <= maxX; ++x)
                    for (let y = minY; y <= maxY; ++y)
                        if (this._cells[x][y] !== 0) {
                            canMoveDirect = false;
                            x = maxX + 1;
                            break
                        }
                if (canMoveDirect) return [{
                    x: endX,
                    y: endY
                }]
            }
            return this._AStarFindPath(startX, startY)
        }
        _AStarFindPath(startX, startY) {
            const diagonals = this._diagonalsEnabled;
            const openList = this._openList;
            const openMap = this._openMap;
            const closedSet = this._closedSet;
            const startNode = new Node(startX, startY);
            openList.Add(startNode);
            openMap.set(XYToKey(startX, startY), startNode);
            while (!openList.IsEmpty()) {
                const c =
                    openList.Shift();
                const key = XYToKey(c._x, c._y);
                openMap.delete(key);
                closedSet.add(key);
                if (c._x === this._targetX && c._y === this._targetY) {
                    this._ClearIntermediateData();
                    return this._GetResultPath(c)
                }
                this._currentNode = c;
                const x = c._x;
                const y = c._y;
                const obsLeft = this.At(x - 1, y) === PF_OBSTACLE;
                const obsTop = this.At(x, y - 1) === PF_OBSTACLE;
                const obsRight = this.At(x + 1, y) === PF_OBSTACLE;
                const obsBottom = this.At(x, y + 1) === PF_OBSTACLE;
                if (!obsLeft) this._AddCellToOpenList(x - 1, y, 10);
                if (diagonals && !obsLeft && !obsTop && this.At(x -
                        1, y - 1) !== PF_OBSTACLE) this._AddCellToOpenList(x - 1, y - 1, 14);
                if (!obsTop) this._AddCellToOpenList(x, y - 1, 10);
                if (diagonals && !obsTop && !obsRight && this.At(x + 1, y - 1) !== PF_OBSTACLE) this._AddCellToOpenList(x + 1, y - 1, 14);
                if (!obsRight) this._AddCellToOpenList(x + 1, y, 10);
                if (diagonals && !obsRight && !obsBottom && this.At(x + 1, y + 1) !== PF_OBSTACLE) this._AddCellToOpenList(x + 1, y + 1, 14);
                if (!obsBottom) this._AddCellToOpenList(x, y + 1, 10);
                if (diagonals && !obsBottom && !obsLeft && this.At(x - 1, y + 1) !== PF_OBSTACLE) this._AddCellToOpenList(x - 1, y + 1,
                    14)
            }
            this._ClearIntermediateData();
            return null
        }
        _AddCellToOpenList(x, y, g) {
            const key = XYToKey(x, y);
            if (this._closedSet.has(key)) return;
            const curCellCost = this.At(x, y);
            const c = this._openMap.get(key);
            if (c) {
                if (this._currentNode._g + g + curCellCost < c._g) this._UpdateNodeInOpenList(c, g, curCellCost);
                return
            }
            this._AddNewNodeToOpenList(x, y, g, curCellCost)
        }
        _UpdateNodeInOpenList(c, g, curCellCost) {
            const openList = this._openList;
            const currentNode = this._currentNode;
            openList.Remove(c);
            c._parent = currentNode;
            c._g = currentNode._g +
                g + curCellCost;
            c._h = this._EstimateH(c._x, c._y);
            c._f = c._g + c._h;
            openList.Add(c)
        }
        _AddNewNodeToOpenList(x, y, g, curCellCost) {
            const c = new Node(x, y);
            const h = this._EstimateH(x, y);
            const g2 = this._currentNode._g + g + curCellCost;
            c._h = h;
            c._g = g2;
            c._f = h + g2;
            c._parent = this._currentNode;
            this._openMap.set(XYToKey(x, y), c);
            this._openList.Add(c)
        }
        _EstimateH(x, y) {
            const dx = Math.abs(x - this._targetX);
            const dy = Math.abs(y - this._targetY);
            return dx * 10 + dy * 10
        }
        _GetResultPath(endNode) {
            const pathList = [];
            let addNode = false;
            let lastDir = 8;
            let curDir = -1;
            let p = endNode;
            while (p) {
                if (pathList.length === 0) {
                    addNode = true;
                    if (p._parent) {
                        lastDir = p.DirectionTo(p._parent);
                        curDir = lastDir
                    }
                } else if (!p._parent) addNode = false;
                else {
                    curDir = p.DirectionTo(p._parent);
                    addNode = curDir !== lastDir
                }
                if (addNode) {
                    pathList.push({
                        x: p._x,
                        y: p._y
                    });
                    lastDir = curDir
                }
                p = p._parent
            }
            return pathList.reverse()
        }
    }
};