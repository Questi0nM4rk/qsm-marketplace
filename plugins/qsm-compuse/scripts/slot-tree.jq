# slot-tree.jq — a Workbench inspect reply as the nested tree geom.jq reads:
# {type, x, y, w, h, children} in the scene's own coordinates (the preview's scene, not output pixels).
def clean: sub("_QMLTYPE_[0-9]+"; "") | sub("\\(0x[0-9a-f]+\\)$"; "");
.data.native.nodes as $n
| def build($i): $n[$i] as $x
  | {type: ($x.type | clean), x: $x.scene.x, y: $x.scene.y, w: $x.width, h: $x.height,
     visible: $x.visible, enabled: $x.enabled, objectName: $x.objectName,
     children: [$x.children[] | build(.)]};
{tree: build(0)}
