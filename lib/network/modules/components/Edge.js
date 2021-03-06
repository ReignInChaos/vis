var util = require('../../../util');

import Label              from './shared/Label'
import BezierEdgeDynamic  from './edges/BezierEdgeDynamic'
import BezierEdgeStatic   from './edges/BezierEdgeStatic'
import StraightEdge       from './edges/StraightEdge'

/**
 * @class Edge
 *
 * A edge connects two nodes
 * @param {Object} properties     Object with options. Must contain
 *                                At least options from and to.
 *                                Available options: from (number),
 *                                to (number), label (string, color (string),
 *                                width (number), style (string),
 *                                length (number), title (string)
 * @param {Network} network       A Network object, used to find and edge to
 *                                nodes.
 * @param {Object} constants      An object with default values for
 *                                example for the color
 */
class Edge {
  constructor(options, body, globalOptions) {
    if (body === undefined) {
      throw "No body provided";
    }
    this.options = util.bridgeObject(globalOptions);
    this.body = body;

    // initialize variables
    this.id = undefined;
    this.fromId = undefined;
    this.toId = undefined;
    this.selected = false;
    this.hover = false;
    this.labelDirty = true;
    this.colorDirty = true;

    this.baseWidth = this.options.width;
    this.baseFontSize = this.options.font.size;

    this.from = undefined; // a node
    this.to   = undefined; // a node

    this.edgeType = undefined;

    this.connected = false;

    this.labelModule = new Label(this.body, this.options);

    this.setOptions(options);
  }


  /**
   * Set or overwrite options for the edge
   * @param {Object} options  an object with options
   * @param doNotEmit
   */
  setOptions(options) {
    if (!options) {
      return;
    }
    this.colorDirty = true;

    Edge.parseOptions(this.options, options, true);

    if (options.id !== undefined)   {this.id = options.id;}
    if (options.from !== undefined) {this.fromId = options.from;}
    if (options.to !== undefined)   {this.toId = options.to;}
    if (options.title !== undefined) {this.title = options.title;}
    if (options.value !== undefined)  {options.value = parseFloat(options.value);}


    // update label Module
    this.updateLabelModule();

    let dataChanged = this.updateEdgeType();

    // if anything has been updates, reset the selection width and the hover width
    this._setInteractionWidths();

    // A node is connected when it has a from and to node that both exist in the network.body.nodes.
    this.connect();

    if (options.hidden !== undefined || options.physics !== undefined) {
      dataChanged = true;
    }

    return dataChanged;
  }

  static parseOptions(parentOptions, newOptions, allowDeletion = false) {
    var fields = [
      'id',
      'from',
      'hidden',
      'hoverWidth',
      'label',
      'length',
      'line',
      'opacity',
      'physics',
      'selectionWidth',
      'selfReferenceSize',
      'to',
      'title',
      'value',
      'width'
    ];

    // only deep extend the items in the field array. These do not have shorthand.
    util.selectiveDeepExtend(fields, parentOptions, newOptions, allowDeletion);

    util.mergeOptions(parentOptions, newOptions, 'smooth');
    util.mergeOptions(parentOptions, newOptions, 'shadow');

    if (newOptions.dashes !== undefined && newOptions.dashes !== null) {
      parentOptions.dashes = newOptions.dashes;
    }
    else if (allowDeletion === true && newOptions.dashes === null) {
      parentOptions.dashes = undefined;
      delete parentOptions.dashes;
    }

    // set the scaling newOptions
    if (newOptions.scaling !== undefined && newOptions.scaling !== null) {
      if (newOptions.scaling.min !== undefined) {parentOptions.scaling.min = newOptions.scaling.min;}
      if (newOptions.scaling.max !== undefined) {parentOptions.scaling.max = newOptions.scaling.max;}
      util.mergeOptions(parentOptions.scaling, newOptions.scaling, 'label');
    }
    else if (allowDeletion === true && newOptions.scaling === null) {
      parentOptions.scaling = undefined;
      delete parentOptions.scaling;
    }

    // hanlde multiple input cases for arrows
    if (newOptions.arrows !== undefined && newOptions.arrows !== null) {
      if (typeof newOptions.arrows === 'string') {
        let arrows = newOptions.arrows.toLowerCase();
        if (arrows.indexOf("to")     != -1) {parentOptions.arrows.to.enabled     = true;}
        if (arrows.indexOf("middle") != -1) {parentOptions.arrows.middle.enabled = true;}
        if (arrows.indexOf("from")   != -1) {parentOptions.arrows.from.enabled   = true;}
      }
      else if (typeof newOptions.arrows === 'object') {
        util.mergeOptions(parentOptions.arrows, newOptions.arrows, 'to');
        util.mergeOptions(parentOptions.arrows, newOptions.arrows, 'middle');
        util.mergeOptions(parentOptions.arrows, newOptions.arrows, 'from');
      }
      else {
        throw new Error("The arrow newOptions can only be an object or a string. Refer to the documentation. You used:" + JSON.stringify(newOptions.arrows));
      }
    }
    else if (allowDeletion === true && newOptions.arrows === null) {
      parentOptions.arrows = undefined;
      delete parentOptions.arrows;
    }

    // hanlde multiple input cases for color
    if (newOptions.color !== undefined && newOptions.color !== null) {
      if (util.isString(newOptions.color)) {
        parentOptions.color.color     = newOptions.color;
        parentOptions.color.highlight = newOptions.color;
        parentOptions.color.hover     = newOptions.color;
        parentOptions.color.inherit   = false;
      }
      else {
        let colorsDefined = false;
        if (newOptions.color.color     !== undefined) {parentOptions.color.color     = newOptions.color.color;     colorsDefined = true;}
        if (newOptions.color.highlight !== undefined) {parentOptions.color.highlight = newOptions.color.highlight; colorsDefined = true;}
        if (newOptions.color.hover     !== undefined) {parentOptions.color.hover     = newOptions.color.hover;     colorsDefined = true;}
        if (newOptions.color.inherit   !== undefined) {parentOptions.color.inherit   = newOptions.color.inherit;}
        if (newOptions.color.opacity   !== undefined) {parentOptions.color.opacity   = Math.min(1,Math.max(0,newOptions.color.opacity));}

        if (newOptions.color.inherit === undefined && colorsDefined === true) {
          parentOptions.color.inherit = false;
        }
      }
    }
    else if (allowDeletion === true && newOptions.color === null) {
      parentOptions.color = undefined;
      delete parentOptions.color;
    }

    // handle the font settings
    if (newOptions.font !== undefined) {
      Label.parseOptions(parentOptions.font, newOptions);
    }
  }


  /**
   * update the options in the label module
   */
  updateLabelModule() {
    this.labelModule.setOptions(this.options, true);
    if (this.labelModule.baseSize !== undefined) {
      this.baseFontSize = this.labelModule.baseSize;
    }
  }

  /**
   * update the edge type, set the options
   * @returns {boolean}
   */
  updateEdgeType() {
    let dataChanged = false;
    let changeInType = true;
    if (this.edgeType !== undefined) {
      if (this.edgeType instanceof BezierEdgeDynamic && this.options.smooth.enabled === true && this.options.smooth.type === 'dynamic') {changeInType = false;}
      if (this.edgeType instanceof BezierEdgeStatic  && this.options.smooth.enabled === true && this.options.smooth.type !== 'dynamic') {changeInType = false;}
      if (this.edgeType instanceof StraightEdge      && this.options.smooth.enabled === false)                                          {changeInType = false;}

      if (changeInType === true) {
        dataChanged = this.edgeType.cleanup();
      }
    }

    if (changeInType === true) {
      if (this.options.smooth.enabled === true) {
        if (this.options.smooth.type === 'dynamic') {
          dataChanged = true;
          this.edgeType = new BezierEdgeDynamic(this.options, this.body, this.labelModule);
        }
        else {
          this.edgeType = new BezierEdgeStatic(this.options, this.body, this.labelModule);
        }
      }
      else {
        this.edgeType = new StraightEdge(this.options, this.body, this.labelModule);
      }
    }
    else {
      // if nothing changes, we just set the options.
      this.edgeType.setOptions(this.options);
    }

    return dataChanged;
  }


  /**
   * Enable or disable the physics.
   * @param status
   */
  togglePhysics(status) {
    this.options.physics = status;
    this.edgeType.togglePhysics(status);
  }

  /**
   * Connect an edge to its nodes
   */
  connect() {
    this.disconnect();

    this.from = this.body.nodes[this.fromId] || undefined;
    this.to = this.body.nodes[this.toId] || undefined;
    this.connected = (this.from !== undefined && this.to !== undefined);

    if (this.connected === true) {
      this.from.attachEdge(this);
      this.to.attachEdge(this);
    }
    else {
      if (this.from) {
        this.from.detachEdge(this);
      }
      if (this.to) {
        this.to.detachEdge(this);
      }
    }

    this.edgeType.connect();
  }


  /**
   * Disconnect an edge from its nodes
   */
  disconnect() {
    if (this.from) {
      this.from.detachEdge(this);
      this.from = undefined;
    }
    if (this.to) {
      this.to.detachEdge(this);
      this.to = undefined;
    }

    this.connected = false;
  }


  /**
   * get the title of this edge.
   * @return {string} title    The title of the edge, or undefined when no title
   *                           has been set.
   */
  getTitle() {
    return this.title;
  }


  /**
   * check if this node is selecte
   * @return {boolean} selected   True if node is selected, else false
   */
  isSelected() {
    return this.selected;
  }



  /**
   * Retrieve the value of the edge. Can be undefined
   * @return {Number} value
   */
  getValue() {
    return this.options.value;
  }


  /**
   * Adjust the value range of the edge. The edge will adjust it's width
   * based on its value.
   * @param {Number} min
   * @param {Number} max
   * @param total
   */
  setValueRange(min, max, total) {
    if (this.options.value !== undefined) {
      var scale = this.options.scaling.customScalingFunction(min, max, total, this.options.value);
      var widthDiff = this.options.scaling.max - this.options.scaling.min;
      if (this.options.scaling.label.enabled === true) {
        var fontDiff = this.options.scaling.label.max - this.options.scaling.label.min;
        this.options.font.size = this.options.scaling.label.min + scale * fontDiff;
      }
      this.options.width = this.options.scaling.min + scale * widthDiff;
    }
    else {
      this.options.width = this.baseWidth;
      this.options.font.size = this.baseFontSize;
    }

    this._setInteractionWidths();
  }

   _setInteractionWidths() {
     if (typeof this.options.hoverWidth === 'function') {
        this.edgeType.hoverWidth = this.options.hoverWidth(this.options.width);
     }
     else {
       this.edgeType.hoverWidth = this.options.hoverWidth + this.options.width;
     }

     if (typeof this.options.selectionWidth === 'function') {
       this.edgeType.selectionWidth = this.options.selectionWidth(this.options.width);
     }
     else {
       this.edgeType.selectionWidth = this.options.selectionWidth + this.options.width;
     }
   }


  /**
   * Redraw a edge
   * Draw this edge in the given canvas
   * The 2d context of a HTML canvas can be retrieved by canvas.getContext("2d");
   * @param {CanvasRenderingContext2D}   ctx
   */
  draw(ctx) {
    let via = this.edgeType.drawLine(ctx, this.selected, this.hover);
    this.drawArrows(ctx, via);
    this.drawLabel (ctx, via);
  }

  drawArrows(ctx, viaNode) {
    if (this.options.arrows.from.enabled   === true) {this.edgeType.drawArrowHead(ctx,'from',   viaNode, this.selected, this.hover);}
    if (this.options.arrows.middle.enabled === true) {this.edgeType.drawArrowHead(ctx,'middle', viaNode, this.selected, this.hover);}
    if (this.options.arrows.to.enabled     === true) {this.edgeType.drawArrowHead(ctx,'to',     viaNode, this.selected, this.hover);}
  }

  drawLabel(ctx, viaNode) {
    if (this.options.label !== undefined) {
      // set style
      var node1 = this.from;
      var node2 = this.to;
      var selected = (this.from.selected || this.to.selected || this.selected);
      if (node1.id != node2.id) {
        this.labelModule.pointToSelf = false;
        var point = this.edgeType.getPoint(0.5, viaNode);
        ctx.save();

        // if the label has to be rotated:
        if (this.options.font.align !== "horizontal") {
          this.labelModule.calculateLabelSize(ctx,selected,point.x,point.y);
          ctx.translate(point.x, this.labelModule.size.yLine);
          this._rotateForLabelAlignment(ctx);
        }

        // draw the label
        this.labelModule.draw(ctx, point.x, point.y, selected);
        ctx.restore();
      }
      else {
        // Ignore the orientations.
        this.labelModule.pointToSelf = true;
        var x, y;
        var radius = this.options.selfReferenceSize;
        if (node1.shape.width > node1.shape.height) {
          x = node1.x + node1.shape.width * 0.5;
          y = node1.y - radius;
        }
        else {
          x = node1.x + radius;
          y = node1.y - node1.shape.height * 0.5;
        }
        point = this._pointOnCircle(x, y, radius, 0.125);
        this.labelModule.draw(ctx, point.x, point.y, selected);
      }
    }
  }


  /**
   * Check if this object is overlapping with the provided object
   * @param {Object} obj   an object with parameters left, top
   * @return {boolean}     True if location is located on the edge
   */
  isOverlappingWith(obj) {
    if (this.connected) {
      var distMax = 10;
      var xFrom = this.from.x;
      var yFrom = this.from.y;
      var xTo = this.to.x;
      var yTo = this.to.y;
      var xObj = obj.left;
      var yObj = obj.top;

      var dist = this.edgeType.getDistanceToEdge(xFrom, yFrom, xTo, yTo, xObj, yObj);

      return (dist < distMax);
    }
    else {
      return false
    }
  }


  /**
   * Rotates the canvas so the text is most readable
   * @param {CanvasRenderingContext2D} ctx
   * @private
   */
  _rotateForLabelAlignment(ctx) {
    var dy = this.from.y - this.to.y;
    var dx = this.from.x - this.to.x;
    var angleInDegrees = Math.atan2(dy, dx);

    // rotate so label it is readable
    if ((angleInDegrees < -1 && dx < 0) || (angleInDegrees > 0 && dx < 0)) {
      angleInDegrees = angleInDegrees + Math.PI;
    }

    ctx.rotate(angleInDegrees);
  }


  /**
   * Get a point on a circle
   * @param {Number} x
   * @param {Number} y
   * @param {Number} radius
   * @param {Number} percentage. Value between 0 (line start) and 1 (line end)
   * @return {Object} point
   * @private
   */
  _pointOnCircle(x, y, radius, percentage) {
    var angle = percentage * 2 * Math.PI;
    return {
      x: x + radius * Math.cos(angle),
      y: y - radius * Math.sin(angle)
    }
  }


  select() {
    this.selected = true;
  }


  unselect() {
    this.selected = false;
  }
}

export default Edge;