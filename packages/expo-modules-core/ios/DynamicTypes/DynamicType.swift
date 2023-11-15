// Copyright 2021-present 650 Industries. All rights reserved.

/**
 Handy prefix operator that makes the dynamic type from the static type.
 */
prefix operator ~
public prefix func ~ <T>(type: T.Type) -> AnyDynamicType where T: AnyArgument {
  return type.getDynamicType()
}

public prefix func ~ <T>(type: T.Type) -> AnyDynamicType {
  return DynamicRawType(innerType: type)
}
